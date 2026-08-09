import { App, Editor, EditorPosition, Notice } from "obsidian";
import { ACTION_DEFS, ActionId, buildPrompt } from "./actions";
import { ChatMessage, chatComplete, LLMError, streamChat } from "./llm";
import { NoteAISettings } from "./settings";

interface TargetRange {
  from: EditorPosition;
  to: EditorPosition;
  hasSelection: boolean;
  text: string;
}

function getParagraphRange(editor: Editor, cursor: EditorPosition): TargetRange | null {
  const lastLine = editor.lineCount() - 1;
  let start = cursor.line;
  let end = cursor.line;
  while (start > 0 && editor.getLine(start - 1).trim() !== "") start--;
  while (end < lastLine && editor.getLine(end + 1).trim() !== "") end++;
  const from: EditorPosition = { line: start, ch: 0 };
  const to: EditorPosition = { line: end, ch: editor.getLine(end).length };
  const text = editor.getRange(from, to);
  return text.trim() ? { from, to, hasSelection: false, text } : null;
}

function getTargetRange(editor: Editor, maxChars: number): TargetRange {
  const selection = editor.listSelections()[0] ?? { anchor: editor.getCursor(), head: editor.getCursor() };
  const from: EditorPosition = { line: selection.anchor.line, ch: selection.anchor.ch };
  const to: EditorPosition = { line: selection.head.line, ch: selection.head.ch };
  const selected = editor.getRange(from, to);
  if (selected.trim().length > 0) {
    return { from, to, hasSelection: true, text: selected.slice(0, maxChars) };
  }

  const cursor = editor.getCursor();
  const paragraph = editor.getLine(cursor.line).trim() !== "" ? getParagraphRange(editor, cursor) : null;
  if (paragraph) {
    return { ...paragraph, text: paragraph.text.slice(0, maxChars) };
  }

  const doc = editor.getValue();
  const trimmed = doc.trim();
  if (trimmed.length > 0 && trimmed.length <= maxChars) {
    return { from: { line: 0, ch: 0 }, to: editor.offsetToPos(doc.length), hasSelection: false, text: trimmed };
  }
  if (trimmed.length > 0) {
    // 长笔记：只把开头作为上下文，结果插入光标处，避免误替换整篇笔记
    return { from: cursor, to: cursor, hasSelection: false, text: trimmed.slice(0, maxChars) };
  }
  return { from: cursor, to: cursor, hasSelection: false, text: "" };
}

function getNoteContext(app: App, editor: Editor): string {
  const file = app.workspace.getActiveFile();
  const title = file ? file.basename : "未命名笔记";
  const head = editor.getValue().slice(0, 1200);
  return `笔记标题：${title}\n笔记开头：${head || "（空白笔记）"}`;
}

export async function runAction(
  app: App,
  editor: Editor,
  actionId: ActionId,
  settings: NoteAISettings,
  setStatus: (text: string | null) => void,
  param?: string
): Promise<void> {
  const def = ACTION_DEFS[actionId];
  const target = getTargetRange(editor, settings.contextMaxChars);
  const vars: Record<string, string> = {
    selection: target.text,
    context: getNoteContext(app, editor),
  };
  if (param) {
    vars.tone = param;
    vars.language = param;
  }

  const userPrompt = buildPrompt(settings.prompts[actionId] ?? def.defaultPrompt, vars);
  const messages: ChatMessage[] = [
    { role: "system", content: settings.systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), settings.timeoutSec * 1000);
  const started = Date.now();
  setStatus(`AI ${def.name}中…`);

  try {
    if (settings.stream) {
      await streamIntoEditor(editor, target, def.mode, messages, settings, controller.signal);
    } else {
      const text = await chatComplete({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        messages,
        signal: controller.signal,
      });
      applyResult(editor, target, def.mode, text);
    }
    setStatus(null);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    new Notice(`AI ${def.name}完成（${seconds} 秒）`, 3000);
  } catch (e) {
    setStatus(null);
    const err = e as Error;
    if (err?.name === "AbortError") {
      new Notice("请求超时或已取消", 8000);
    } else {
      console.error("[Note AI Assistant]", err);
      new Notice(err instanceof LLMError ? err.message : `请求失败：${err?.message ?? err}`, 10000);
    }
  } finally {
    window.clearTimeout(timer);
  }
}

function applyResult(editor: Editor, target: TargetRange, mode: "replace" | "insert", text: string): void {
  if (mode === "insert") {
    const cursor = editor.getCursor();
    editor.replaceRange(text, cursor, cursor);
    const end = editor.offsetToPos(editor.posToOffset(cursor) + text.length);
    editor.setCursor(end);
    return;
  }
  editor.replaceRange(text, target.from, target.to);
  const end = editor.offsetToPos(editor.posToOffset(target.from) + text.length);
  editor.setSelection(target.from, end);
}

async function streamIntoEditor(
  editor: Editor,
  target: TargetRange,
  mode: "replace" | "insert",
  messages: ChatMessage[],
  settings: NoteAISettings,
  signal: AbortSignal
): Promise<void> {
  const startOffset =
    mode === "replace" ? editor.posToOffset(target.from) : editor.posToOffset(editor.getCursor());
  let written = 0;
  let removed = false;
  let pending = "";
  let flushTimer: number | null = null;

  const flush = (): void => {
    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!pending) return;
    const text = pending;
    pending = "";
    if (!removed) {
      removed = true;
      if (mode === "replace") editor.replaceRange("", target.from, target.to);
    }
    const pos = editor.offsetToPos(startOffset + written);
    editor.replaceRange(text, pos, pos);
    written += text.length;
  };

  try {
    for await (const chunk of streamChat({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      messages,
      signal,
    })) {
      pending += chunk;
      // 约 40ms 批量写入一次，避免每个 token 都触发编辑器更新
      if (flushTimer === null) {
        flushTimer = window.setTimeout(flush, 40);
      }
    }
  } finally {
    if (flushTimer !== null) window.clearTimeout(flushTimer);
    flush();
  }

  if (mode === "replace") {
    const end = editor.offsetToPos(startOffset + written);
    editor.setSelection(target.from, end);
  } else {
    editor.setCursor(editor.offsetToPos(startOffset + written));
  }
}
