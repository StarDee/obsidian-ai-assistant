export type ActionId =
  | "improve"
  | "continue"
  | "fix"
  | "summarize"
  | "longer"
  | "shorter"
  | "tone"
  | "translate"
  | "outline"
  | "bullets"
  | "explain";

export interface ActionDef {
  id: ActionId;
  name: string;
  icon: string;
  /** 操作前是否需要弹窗选择参数（如语气、语言） */
  needsParam?: boolean;
  /** replace=替换目标文本；insert=在光标处追加 */
  mode: "replace" | "insert";
  defaultPrompt: string;
}

export const ACTION_DEFS: Record<ActionId, ActionDef> = {
  improve: {
    id: "improve",
    name: "优化文本",
    icon: "sparkles",
    mode: "replace",
    defaultPrompt:
      "你是一位专业的写作助手。请优化以下文本，使其表达更清晰、流畅、自然，保持原意与 Markdown 格式不变。直接输出优化后的文本，不要添加任何解释、前缀或引号。\n\n{{selection}}",
  },
  continue: {
    id: "continue",
    name: "继续写作",
    icon: "pen-line",
    mode: "insert",
    defaultPrompt:
      "请根据以下文本继续自然地写下去，保持原有语言、风格和主题。如果文本为空，请直接为笔记写一个开头。直接输出续写内容，不要添加任何解释或前缀。\n\n{{selection}}",
  },
  fix: {
    id: "fix",
    name: "修复拼写与语法",
    icon: "check",
    mode: "replace",
    defaultPrompt:
      "请修复以下文本中的拼写、语法和标点错误，保持原意与 Markdown 格式不变。直接输出修正后的文本，不要添加任何解释。\n\n{{selection}}",
  },
  summarize: {
    id: "summarize",
    name: "总结",
    icon: "list-tree",
    mode: "replace",
    defaultPrompt:
      "请用简洁的语言总结以下文本，突出关键要点，可使用 Markdown 列表。直接输出总结内容，不要添加任何解释或前缀。\n\n{{selection}}",
  },
  longer: {
    id: "longer",
    name: "扩写",
    icon: "maximize",
    mode: "replace",
    defaultPrompt:
      "请在保持原意的基础上扩展以下文本，补充细节、例子和论证，使其更充实完整，保持 Markdown 格式。直接输出扩写后的完整文本。\n\n{{selection}}",
  },
  shorter: {
    id: "shorter",
    name: "精简",
    icon: "minimize",
    mode: "replace",
    defaultPrompt:
      "请在保留核心意思的前提下精简以下文本，删去冗余内容，保持 Markdown 格式。直接输出精简后的文本。\n\n{{selection}}",
  },
  tone: {
    id: "tone",
    name: "改变语气",
    icon: "message-circle",
    needsParam: true,
    mode: "replace",
    defaultPrompt:
      "请将以下文本改写为{{tone}}的语气，保持原意与 Markdown 格式不变。直接输出改写后的文本，不要添加任何解释。\n\n{{selection}}",
  },
  translate: {
    id: "translate",
    name: "翻译",
    icon: "languages",
    needsParam: true,
    mode: "replace",
    defaultPrompt:
      "请将以下文本翻译为{{language}}，保持 Markdown 格式与链接结构不变。直接输出翻译结果，不要添加任何解释。\n\n{{selection}}",
  },
  outline: {
    id: "outline",
    name: "生成大纲",
    icon: "list",
    mode: "replace",
    defaultPrompt:
      "请为以下文本生成结构清晰、层级分明的笔记大纲，使用 Markdown 无序列表。直接输出大纲，不要添加任何解释。\n\n{{selection}}",
  },
  bullets: {
    id: "bullets",
    name: "转为要点列表",
    icon: "list",
    mode: "replace",
    defaultPrompt:
      "请将以下文本改写为简洁的 Markdown 无序列表要点，保留关键信息。直接输出列表，不要添加任何解释。\n\n{{selection}}",
  },
  explain: {
    id: "explain",
    name: "解释所选内容",
    icon: "help-circle",
    mode: "replace",
    defaultPrompt:
      "请用通俗易懂的语言解释以下文本或概念，必要时给出例子。直接输出解释内容，不要添加任何解释性前缀。\n\n{{selection}}",
  },
};

export const ACTION_ORDER: ActionId[] = [
  "improve",
  "continue",
  "fix",
  "summarize",
  "longer",
  "shorter",
  "tone",
  "translate",
  "outline",
  "bullets",
  "explain",
];

export const TONE_OPTIONS = ["专业", "正式", "轻松", "口语化", "积极", "简洁有力", "学术", "创意", "幽默"];

export const LANGUAGE_OPTIONS = ["中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español", "Русский", "繁體中文"];

export function buildPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}
