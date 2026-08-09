/**
 * Ask AI 的上下文组装逻辑。
 *
 * 设计原则：
 * 1. 有选中文本时，优先把选中内容作为核心上下文发送（选区优先）；
 * 2. 没有选区时，附带整篇笔记内容（受 contextMaxChars 限制）；
 * 3. 任何情况下都不能因为设置异常（contextMaxChars 为 0 / NaN 等）而静默丢失上下文。
 */

export const DEFAULT_CONTEXT_MAX_CHARS = 8000;

/**
 * 将设置中的上下文最大字符数消毒为合法的正整数。
 * 旧版本或手动编辑 data.json 可能写入 0、负数、NaN、字符串等，
 * 这些值会导致 slice(0, 0) 把笔记内容截成空串，必须兜底。
 */
export function sanitizeContextMaxChars(value: unknown, fallback: number = DEFAULT_CONTEXT_MAX_CHARS): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export interface BuildAskMessageInput {
  /** 设置项：是否自动附带笔记内容 */
  includeContext: boolean;
  /** 设置项：上下文最大字符数 */
  contextMaxChars: number;
  /** 当前笔记标题（basename），无笔记时为 null */
  noteTitle: string | null;
  /** 当前笔记全文（editor.getValue()） */
  noteContent: string;
  /** 当前编辑器选区文本（editor.getSelection()），无选区时为空串 */
  selection: string;
  /** 用户在弹窗中输入的问题 / 指令 */
  question: string;
}

function pickTitle(title: string | null | undefined): string {
  return (title ?? "").trim() || "未命名笔记";
}

function pickSelection(selection: string | undefined): string {
  return (selection ?? "").trim();
}

function pickContent(content: string | undefined): string {
  return (content ?? "").trim();
}

/**
 * 组装发送给模型的完整 user 消息。
 * - includeContext 关闭：只返回问题本身（与旧行为一致）。
 * - 有选区：附带《笔记标题 + 选中内容》。
 * - 无选区且笔记非空：附带《笔记标题 + 笔记内容》。
 * - 无选区且笔记为空：明确告知模型笔记为空，避免“内容被静默丢弃”的错觉。
 */
export function buildAskUserMessage(input: BuildAskMessageInput): string {
  const question = (input.question ?? "").trim();
  const title = pickTitle(input.noteTitle);
  const selection = pickSelection(input.selection);

  if (!input.includeContext) return question;

  const maxChars = sanitizeContextMaxChars(input.contextMaxChars);

  if (selection) {
    return (
      `以下是当前笔记《${title}》中你选中的内容：\n\n${selection.slice(0, maxChars)}\n\n` +
      `请基于以上内容回答或执行以下指令（若与内容无关可直接回答）：\n\n${question}`
    );
  }

  const content = pickContent(input.noteContent);
  if (content) {
    return (
      `以下是当前笔记《${title}》的内容：\n\n${content.slice(0, maxChars)}\n\n` +
      `请基于以上笔记内容回答或执行以下指令（若与笔记无关可直接回答）：\n\n${question}`
    );
  }

  return (
    `以下是当前笔记《${title}》的内容（当前为空）：\n\n（空）\n\n` +
    `请基于以上笔记内容回答或执行以下指令（若与笔记无关可直接回答）：\n\n${question}`
  );
}

/**
 * 生成一行中文说明，用于 Ask AI 弹窗中展示“本次实际会附带哪些内容”，
 * 让用户能在发送前确认模型确实收到了上下文。
 */
export function describeAskContext(input: Omit<BuildAskMessageInput, "question">): string {
  const title = pickTitle(input.noteTitle);

  if (!input.includeContext) {
    return "设置已关闭“自动附带笔记内容”：仅发送你的问题，不会附带笔记或选区。";
  }

  const maxChars = sanitizeContextMaxChars(input.contextMaxChars);
  const selection = pickSelection(input.selection);
  if (selection) {
    return `将附带笔记《${title}》中你选中的内容（共 ${selection.length} 字，上限 ${maxChars} 字）。`;
  }

  const content = pickContent(input.noteContent);
  if (content) {
    const shown = Math.min(content.length, maxChars);
    const truncated = content.length > shown;
    return `将附带笔记《${title}》内容（${shown} 字${truncated ? `，超出部分已截取前 ${shown} 字` : ""}）。`;
  }

  return `笔记《${title}》当前为空，将告知模型“笔记为空”。`;
}
