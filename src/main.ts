import { Editor, MarkdownView, Menu, Notice, Plugin } from "obsidian";
import { ACTION_DEFS, ACTION_ORDER, ActionId } from "./actions";
import { runAction } from "./editor-actions";
import { chatComplete, streamChat } from "./llm";
import { AskAIModal, LanguageModal, ToneModal } from "./modals";
import { DEFAULT_SETTINGS, NoteAISettings, NoteAISettingTab } from "./settings";

export default class NoteAIPlugin extends Plugin {
  settings!: NoteAISettings;
  private statusBarEl!: HTMLElement;
  private aiBusy = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.statusBarEl = this.addStatusBarItem();
    this.setStatus(null);
    this.addSettingTab(new NoteAISettingTab(this.app, this));
    this.registerCommands();
    this.registerEditorMenu();
  }

  onunload(): void {
    this.statusBarEl?.remove();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  setStatus(text: string | null): void {
    if (!this.statusBarEl) return;
    this.statusBarEl.setText(text ?? "");
    this.statusBarEl.toggleClass("note-ai-status", !!text);
  }

  async testConnection(): Promise<string> {
    const reply = await chatComplete({
      baseUrl: this.settings.baseUrl,
      apiKey: this.settings.apiKey,
      model: this.settings.model,
      temperature: 0.2,
      maxTokens: 64,
      messages: [{ role: "user", content: "请只回复两个字：成功" }],
    });
    return reply.trim();
  }

  private registerCommands(): void {
    for (const id of ACTION_ORDER) {
      const def = ACTION_DEFS[id];
      this.addCommand({
        id: `action-${id}`,
        name: `${def.name}${def.needsParam ? "…" : ""}`,
        icon: def.icon,
        editorCallback: (editor: Editor) => {
          void this.handleAction(id, editor);
        },
      });
    }

    this.addCommand({
      id: "ask-ai",
      name: "Ask AI：提问并插入到笔记",
      icon: "bot",
      editorCallback: (editor: Editor) => {
        this.openAskModal(editor);
      },
    });
  }

  private registerEditorMenu(): void {
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
        const items: Array<{ name: string; icon: string; id: ActionId }> = [
          { name: "AI 优化文本", icon: "sparkles", id: "improve" },
          { name: "AI 继续写作", icon: "pen-line", id: "continue" },
          { name: "AI 总结", icon: "list-tree", id: "summarize" },
          { name: "AI 修复语法", icon: "check", id: "fix" },
          { name: "AI 改变语气…", icon: "message-circle", id: "tone" },
          { name: "AI 翻译…", icon: "languages", id: "translate" },
          { name: "AI 解释所选内容", icon: "help-circle", id: "explain" },
        ];
        for (const item of items) {
          menu.addItem((menuItem) => {
            menuItem.setTitle(item.name).setIcon(item.icon).onClick(() => {
              void this.handleAction(item.id, editor);
            });
          });
        }
        menu.addSeparator();
        menu.addItem((menuItem) => {
          menuItem.setTitle("Ask AI…").setIcon("bot").onClick(() => this.openAskModal(editor));
        });
      })
    );
  }

  private handleAction(id: ActionId, editor: Editor): void {
    const def = ACTION_DEFS[id];
    if (this.aiBusy) {
      new Notice("已有 AI 操作正在进行，请稍候");
      return;
    }
    const run = (param?: string) =>
      void this.runExclusive(() =>
        runAction(this.app, editor, id, this.settings, (text) => this.setStatus(text), param)
      );

    if (def.needsParam) {
      if (id === "tone") {
        new ToneModal(this.app, (tone) => void run(tone)).open();
      } else if (id === "translate") {
        new LanguageModal(this.app, (language) => void run(language)).open();
      }
      return;
    }
    void run();
  }

  private openAskModal(editor: Editor): void {
    if (this.aiBusy) {
      new Notice("已有 AI 操作正在进行，请稍候");
      return;
    }
    new AskAIModal(this.app, {
      onAsk: async (question, onDelta, signal) => {
        const userContent = this.buildAskUserMessage(editor, question);
        await this.runExclusive(async () => {
          for await (const chunk of streamChat({
            baseUrl: this.settings.baseUrl,
            apiKey: this.settings.apiKey,
            model: this.settings.model,
            temperature: this.settings.temperature,
            maxTokens: this.settings.maxTokens,
            messages: [
              { role: "system", content: this.settings.systemPrompt },
              { role: "user", content: userContent },
            ],
            signal,
          })) {
            onDelta(chunk);
          }
        });
      },
      onInsert: (answer) => {
        if (!answer) {
          new Notice("还没有生成内容");
          return;
        }
        const cursor = editor.getCursor();
        editor.replaceRange(answer + "\n", cursor, cursor);
        editor.setCursor(editor.offsetToPos(editor.posToOffset(cursor) + answer.length + 1));
      },
    }).open();
  }

  /** 同一时间只允许一个 AI 请求，避免重复触发浪费额度 */
  private async runExclusive(fn: () => Promise<void>): Promise<boolean> {
    if (this.aiBusy) {
      new Notice("已有 AI 操作正在进行，请稍候");
      return false;
    }
    this.aiBusy = true;
    try {
      await fn();
      return true;
    } finally {
      this.aiBusy = false;
    }
  }

  private buildAskUserMessage(editor: Editor, question: string): string {
    if (!this.settings.askIncludeContext) return question;
    const file = this.app.workspace.getActiveFile();
    const content = editor.getValue().slice(0, this.settings.contextMaxChars).trim();
    if (!content) return question;
    return (
      `以下是当前笔记《${file?.basename ?? "未命名笔记"}》的内容：\n\n` +
      `${content}\n\n` +
      `请基于以上笔记内容回答或执行以下指令（若与笔记无关可直接回答）：\n\n${question}`
    );
  }
}
