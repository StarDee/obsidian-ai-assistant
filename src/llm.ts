import { normalizeBaseUrl } from "./settings";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

export class LLMError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "LLMError";
    this.status = status;
  }
}

export function buildChatUrl(baseUrl: string): string {
  const url = normalizeBaseUrl(baseUrl);
  if (!url) {
    throw new LLMError("Base URL 不能为空，请在设置中填写模型服务地址。");
  }
  return /\/chat\/completions$/i.test(url) ? url : `${url}/chat/completions`;
}

function describeHttpError(status: number, body: string): string {
  let apiMessage = "";
  try {
    const json = JSON.parse(body);
    apiMessage = json?.error?.message ?? json?.message ?? "";
  } catch {
    /* 响应体不是 JSON，忽略 */
  }
  const suffix = apiMessage ? `：${apiMessage}` : "";
  switch (status) {
    case 401:
      return `API Key 无效或未配置（401）${suffix}`;
    case 403:
      return `没有访问权限（403）${suffix}`;
    case 404:
      return `接口地址不正确（404），请检查 Base URL${suffix}`;
    case 429:
      return `请求过于频繁或账户额度不足（429）${suffix}`;
    default:
      return `请求失败（HTTP ${status}）${suffix}`;
  }
}

async function readBody(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

async function post(opts: ChatOptions, stream: boolean): Promise<Response> {
  const url = buildChatUrl(opts.baseUrl);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        stream,
      }),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new LLMError(`无法连接到模型服务：${msg}`);
  }
  if (!resp.ok) {
    const body = await readBody(resp);
    throw new LLMError(describeHttpError(resp.status, body), resp.status);
  }
  return resp;
}

export async function chatComplete(opts: ChatOptions): Promise<string> {
  const resp = await post(opts, false);
  let data: any;
  try {
    data = await resp.json();
  } catch {
    throw new LLMError("模型服务返回了无法解析的响应。");
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LLMError("模型返回了无法解析的内容，请检查模型名称或接口是否支持 OpenAI 兼容格式。");
  }
  return content;
}

export async function* streamChat(opts: ChatOptions): AsyncGenerator<string> {
  const resp = await post(opts, true);
  if (!resp.body) {
    throw new LLMError("当前环境不支持流式读取，请在设置中关闭“流式输出”。");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const consumePayload = (payload: string): string | null => {
    if (payload === "[DONE]") return null;
    let json: any;
    try {
      json = JSON.parse(payload);
    } catch {
      return "";
    }
    const delta = json?.choices?.[0]?.delta?.content;
    return typeof delta === "string" ? delta : "";
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        const delta = consumePayload(payload);
        if (delta === null) return;
        if (delta) yield delta;
      }

      if (done) {
        const tail = buffer.trim();
        if (tail.startsWith("data:")) {
          const delta = consumePayload(tail.slice(5).trim());
          if (delta) yield delta;
        }
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
