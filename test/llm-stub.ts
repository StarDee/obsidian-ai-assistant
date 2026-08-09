// 编辑器操作测试中使用的固定 LLM 桩。
export class LLMError extends Error {}

export async function* streamChat(): AsyncGenerator<string> {
  yield "ab";
  yield "c";
}

export async function chatComplete(): Promise<string> {
  return "XYZ";
}
