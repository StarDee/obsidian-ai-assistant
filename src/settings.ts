import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { ACTION_DEFS, ACTION_ORDER, ActionId } from "./actions";
import type NoteAIPlugin from "./main";

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "deepseek", name: "DeepSeek（推荐）", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "moonshot", name: "Moonshot（Kimi）", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { id: "zhipu", name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "siliconflow", name: "SiliconFlow 硅基流动", baseUrl: "https://api.siliconflow.cn/v1", model: "deepseek-ai/DeepSeek-V3" },
  { id: "ollama", name: "Ollama（本地）", baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
  { id: "custom", name: "自定义（OpenAI 兼容）", baseUrl: "", model: "" },
];

export interface NoteAISettings {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  timeoutSec: number;
  askIncludeContext: boolean;
  contextMaxChars: number;
  systemPrompt: string;
  prompts: Record<ActionId, string>;
}

export function getDefaultPrompts(): Record<ActionId, string> {
  const prompts = {} as Record<ActionId, string>;
  for (const id of ACTION_ORDER) {
    prompts[id] = ACTION_DEFS[id].defaultPrompt;
  }
  return prompts;
}

export const DEFAULT_SETTINGS: NoteAISettings = {
  provider: "deepseek",
  apiKey: "",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  temperature: 0.7,
  maxTokens: 2048,
  stream: true,
  timeoutSec: 120,
  askIncludeContext: true,
  contextMaxChars: 8000,
  systemPrompt:
    "你是一位专业、可靠的写作助手，擅长中英文 Markdown 笔记的写作与润色。回答保持简洁、准确，优先直接输出笔记内容。",
  prompts: getDefaultPrompts(),
};

export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}

export function normalizeBaseUrl(url: string): string {
  let normalized = (url || "").trim();
  if (!normalized) return normalized;
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  return normalized.replace(/\/+$/, "");
}

export class NoteAISettingTab extends PluginSettingTab {
  plugin: NoteAIPlugin;

  constructor(app: App, plugin: NoteAIPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Note AI Assistant" });
    containerEl.createEl("p", {
      text: "选择一个 OpenAI 兼容的大模型服务，在写作时用 AI 生成或优化笔记。API Key 仅保存在本机 vault 的 data.json 中。",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("模型服务商")
      .setDesc("选择预设服务商，或选择“自定义”填写任意 OpenAI 兼容接口。切换预设会自动填充 Base URL 与模型名称。")
      .addDropdown((dropdown) => {
        for (const preset of PROVIDER_PRESETS) {
          dropdown.addOption(preset.id, preset.name);
        }
        dropdown.setValue(this.plugin.settings.provider);
        dropdown.onChange(async (value) => {
          this.plugin.settings.provider = value;
          const preset = getPreset(value);
          if (preset) {
            if (preset.baseUrl) this.plugin.settings.baseUrl = preset.baseUrl;
            if (preset.model) this.plugin.settings.model = preset.model;
          }
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("从服务商控制台获取，例如 DeepSeek 开放平台（platform.deepseek.com）。留空时以无鉴权方式请求（适用于部分本地服务）。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("sk-...").setValue(this.plugin.settings.apiKey);
        text.onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("OpenAI 兼容接口地址，请求会发送到 <Base URL>/chat/completions。")
      .addText((text) => {
        text.setPlaceholder("https://api.deepseek.com/v1").setValue(this.plugin.settings.baseUrl);
        text.onChange(async (value) => {
          this.plugin.settings.baseUrl = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("模型名称")
      .setDesc("例如 deepseek-chat、gpt-4o-mini、glm-4-flash、llama3.1 等。")
      .addText((text) => {
        text.setPlaceholder("deepseek-chat").setValue(this.plugin.settings.model);
        text.onChange(async (value) => {
          this.plugin.settings.model = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("温度 temperature")
      .setDesc("0 表示更确定保守，1 左右更有创意。")
      .addSlider((slider) => {
        slider.setLimits(0, 2, 0.1);
        slider.setValue(this.plugin.settings.temperature);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.temperature = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("最大输出 Token")
      .setDesc("单次生成的最大 token 数。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.setAttribute("min", "1");
        text.setValue(String(this.plugin.settings.maxTokens));
        text.onChange(async (value) => {
          const n = parseInt(value, 10);
          if (!Number.isNaN(n) && n > 0) {
            this.plugin.settings.maxTokens = n;
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName("请求超时（秒）")
      .setDesc("超过该时间仍未返回则自动取消请求。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.plugin.settings.timeoutSec));
        text.onChange(async (value) => {
          const n = parseInt(value, 10);
          if (!Number.isNaN(n) && n > 0) {
            this.plugin.settings.timeoutSec = n;
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName("流式输出")
      .setDesc("开启后 AI 结果会实时逐字写入笔记（推荐）；关闭则等生成完成后一次性写入。")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.stream);
        toggle.onChange(async (value) => {
          this.plugin.settings.stream = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Ask AI 自动附带笔记内容")
      .setDesc("开启后，Ask AI 提问时自动把当前笔记内容作为上下文发送给模型，无需手动选中文本；关闭则只发送你的问题。")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.askIncludeContext);
        toggle.onChange(async (value) => {
          this.plugin.settings.askIncludeContext = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("上下文最大字符数")
      .setDesc("作为上下文发送给模型的笔记内容上限，避免超出模型上下文窗口。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.setAttribute("min", "100");
        text.setValue(String(this.plugin.settings.contextMaxChars));
        text.onChange(async (value) => {
          const n = parseInt(value, 10);
          if (!Number.isNaN(n) && n >= 100) {
            this.plugin.settings.contextMaxChars = n;
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName("测试连接")
      .setDesc("使用当前配置发送一条测试消息，验证服务商、密钥与模型是否可用。")
      .addButton((button) => {
        button.setButtonText("发送测试请求").setCta();
        button.onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("测试中…");
          try {
            const reply = await this.plugin.testConnection();
            const preview = reply.trim().replace(/\s+/g, " ").slice(0, 80);
            new Notice(`连接成功：${preview}${reply.trim().length > 80 ? "…" : ""}`, 8000);
          } catch (e) {
            new Notice(`连接失败：${e instanceof Error ? e.message : String(e)}`, 10000);
          } finally {
            button.setDisabled(false);
            button.setButtonText("发送测试请求");
          }
        });
      });

    containerEl.createEl("h3", { text: "系统提示词" });
    new Setting(containerEl)
      .setName("系统提示词")
      .setDesc("所有 AI 请求共享的系统提示词，决定模型的基础角色与行为。")
      .addTextArea((textarea) => {
        textarea.inputEl.classList.add("note-ai-prompt-input");
        textarea.setValue(this.plugin.settings.systemPrompt);
        textarea.onChange(async (value) => {
          this.plugin.settings.systemPrompt = value;
          await this.plugin.saveSettings();
        });
      });

    containerEl.createEl("h3", { text: "自定义操作提示词（高级）" });
    containerEl.createEl("p", {
      text: "每个操作对应一条提示词模板。可用占位符：{{selection}}（选中文本或当前段落）、{{context}}（笔记标题与开头）、{{tone}} / {{language}}（语气 / 翻译操作）。",
      cls: "setting-item-description",
    });
    new Setting(containerEl).addButton((button) => {
      button.setButtonText("恢复所有默认提示词");
      button.onClick(async () => {
        this.plugin.settings.prompts = getDefaultPrompts();
        await this.plugin.saveSettings();
        this.display();
      });
    });

    for (const id of ACTION_ORDER) {
      const def = ACTION_DEFS[id];
      new Setting(containerEl)
        .setName(`${def.name} 提示词`)
        .setDesc(def.needsParam ? "该操作会先弹出参数选择（语气 / 语言）。" : "模板占位符见上方说明。")
        .addTextArea((textarea) => {
          textarea.inputEl.classList.add("note-ai-prompt-input");
          textarea.setValue(this.plugin.settings.prompts[id] ?? def.defaultPrompt);
          textarea.onChange(async (value) => {
            this.plugin.settings.prompts[id] = value;
            await this.plugin.saveSettings();
          });
        });
    }
  }
}
