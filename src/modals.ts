import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import { LANGUAGE_OPTIONS, TONE_OPTIONS } from "./actions";

export class ChoiceModal<T> extends Modal {
  protected options: T[];
  private readonly onChoose: (value: T) => void;
  private readonly titleText: string;

  constructor(app: App, title: string, options: T[], onChoose: (value: T) => void) {
    super(app);
    this.titleText = title;
    this.options = options;
    this.onChoose = onChoose;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.titleText });
    for (const option of this.options) {
      const row = contentEl.createDiv({ cls: "note-ai-choice-item" });
      row.textContent = String(option);
      row.addEventListener("click", () => {
        this.onChoose(option);
        this.close();
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class ToneModal extends ChoiceModal<string> {
  constructor(app: App, onChoose: (tone: string) => void) {
    super(app, "选择要使用的语气", TONE_OPTIONS, onChoose);
  }
}

export class LanguageModal extends ChoiceModal<string> {
  constructor(app: App, onChoose: (language: string) => void) {
    super(app, "选择翻译目标语言", LANGUAGE_OPTIONS, onChoose);
  }
}

export interface AskCallbacks {
  onAsk: (question: string, onDelta: (chunk: string) => void, signal: AbortSignal) => Promise<void>;
  onInsert: (answer: string) => void;
}

export class AskAIModal extends Modal {
  private readonly callbacks: AskCallbacks;
  private questionEl!: HTMLTextAreaElement;
  private outputEl!: HTMLDivElement;
  private insertBtn!: HTMLButtonElement;
  private sendBtn!: HTMLButtonElement;
  private answer = "";
  private controller: AbortController | null = null;

  constructor(app: App, callbacks: AskCallbacks) {
    super(app);
    this.callbacks = callbacks;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Ask AI" });
    contentEl.createEl("p", {
      text: "向模型提问，或描述你想生成的内容（未选中文本时也会自动附带当前笔记内容）。例如：“帮我为这篇笔记写一个开头”。",
      cls: "setting-item-description",
    });

    new Setting(contentEl)
      .setName("问题 / 指令")
      .addTextArea((textarea) => {
        this.questionEl = textarea.inputEl;
        textarea.inputEl.rows = 3;
        textarea.setPlaceholder("例如：帮我总结这篇笔记的要点…");
        textarea.inputEl.addEventListener("keydown", (ev) => {
          if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
            ev.preventDefault();
            void this.run();
          }
        });
      });

    const actions = contentEl.createDiv({ cls: "note-ai-ask-actions" });
    const send = new ButtonComponent(actions).setButtonText("生成").setCta();
    send.onClick(() => void this.run());
    this.sendBtn = send.buttonEl;
    new ButtonComponent(actions).setButtonText("停止").onClick(() => this.controller?.abort());
    new ButtonComponent(actions).setButtonText("复制结果").onClick(() => {
      if (!this.answer) {
        new Notice("还没有生成内容");
        return;
      }
      void navigator.clipboard?.writeText(this.answer);
      new Notice("已复制到剪贴板");
    });

    this.outputEl = contentEl.createDiv({ cls: "note-ai-ask-output" });

    const insert = new ButtonComponent(contentEl).setButtonText("插入到笔记").setCta();
    insert.onClick(() => {
      this.callbacks.onInsert(this.answer);
      this.close();
    });
    insert.setDisabled(true);
    this.insertBtn = insert.buttonEl;
  }

  onClose(): void {
    this.controller?.abort();
    this.contentEl.empty();
  }

  private async run(): Promise<void> {
    const question = this.questionEl?.value.trim() ?? "";
    if (!question) {
      new Notice("请输入问题或指令");
      return;
    }
    this.answer = "";
    this.outputEl.empty();
    this.outputEl.textContent = "…";
    this.insertBtn.disabled = true;
    this.sendBtn.disabled = true;
    this.controller = new AbortController();

    try {
      await this.callbacks.onAsk(
        question,
        (chunk) => {
          this.answer += chunk;
          if (!this.outputEl.isConnected) return;
          this.outputEl.textContent = this.answer;
          this.outputEl.scrollTop = this.outputEl.scrollHeight;
        },
        this.controller.signal
      );
      this.insertBtn.disabled = false;
      new Notice("生成完成");
    } catch (e) {
      const err = e as Error;
      if (err?.name === "AbortError") {
        if (this.answer) this.insertBtn.disabled = false;
        new Notice("已停止生成");
      } else {
        console.error("[Note AI Assistant]", err);
        new Notice(err?.message ? `请求失败：${err.message}` : "请求失败，请查看控制台日志", 10000);
      }
    } finally {
      if (this.sendBtn.isConnected) this.sendBtn.disabled = false;
    }
  }
}
