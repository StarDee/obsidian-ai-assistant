import assert from "node:assert/strict";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { test } from "node:test";
import { buildAskUserMessage, describeAskContext, sanitizeContextMaxChars } from "../src/ask-context";
import { runAction } from "../src/editor-actions";
import { buildChatUrl, chatComplete, LLMError, streamChat } from "../src/llm";
import { DEFAULT_SETTINGS, NoteAISettings } from "../src/settings";
import { createMockApp, MockEditor } from "./mock-editor";

// Node 测试环境没有 window，编辑器逻辑中用于计时器。
(globalThis as Record<string, unknown>).window = globalThis;

function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

function makeSettings(overrides: Partial<NoteAISettings> = {}): NoteAISettings {
  return {
    ...DEFAULT_SETTINGS,
    apiKey: "test-key",
    baseUrl: "http://127.0.0.1:1/v1",
    model: "mock-model",
    ...overrides,
  };
}

test("buildChatUrl 规范化 Base URL", () => {
  assert.equal(buildChatUrl("https://api.deepseek.com/v1"), "https://api.deepseek.com/v1/chat/completions");
  assert.equal(buildChatUrl("https://api.deepseek.com/v1/"), "https://api.deepseek.com/v1/chat/completions");
  assert.equal(buildChatUrl("api.deepseek.com"), "https://api.deepseek.com/chat/completions");
  assert.equal(buildChatUrl("https://x.com/v1/chat/completions"), "https://x.com/v1/chat/completions");
});

test("streamChat 解析 SSE 增量内容", async () => {
  const { server, port } = await startServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const payload = JSON.parse(body);
      assert.equal(payload.stream, true);
      assert.equal(req.headers.authorization, "Bearer test-key");
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const deltas = ["你", "好", "，", "世界！"];
      let index = 0;
      const timer = setInterval(() => {
        if (index < deltas.length) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: deltas[index] } }] })}\n\n`);
          index++;
        } else {
          res.write("data: [DONE]\n\n");
          clearInterval(timer);
          res.end();
        }
      }, 5);
    });
  });

  try {
    const chunks: string[] = [];
    for await (const chunk of streamChat({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: "test-key",
      model: "mock",
      messages: [{ role: "user", content: "hi" }],
    })) {
      chunks.push(chunk);
    }
    assert.equal(chunks.join(""), "你好，世界！");
  } finally {
    server.close();
  }
});

test("chatComplete 非流式返回内容", async () => {
  const { server, port } = await startServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const payload = JSON.parse(body);
      assert.equal(payload.stream, false);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
    });
  });

  try {
    const reply = await chatComplete({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: "test-key",
      model: "mock",
      messages: [{ role: "user", content: "ping" }],
    });
    assert.equal(reply, "OK");
  } finally {
    server.close();
  }
});

test("HTTP 401 时抛出带服务商信息的 LLMError", async () => {
  const { server, port } = await startServer((_req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "invalid api key" } }));
  });

  try {
    await assert.rejects(
      chatComplete({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: "bad",
        model: "mock",
        messages: [{ role: "user", content: "ping" }],
      }),
      (error: unknown) => {
        assert.ok(error instanceof LLMError);
        assert.match(error.message, /API Key 无效/);
        assert.match(error.message, /invalid api key/);
        return true;
      }
    );
  } finally {
    server.close();
  }
});

test("streamChat 支持中途取消（AbortError）", async () => {
  const { server, port } = await startServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "x" } }] })}\n\n`);
    // 不再返回后续内容，等待客户端断开
  });

  const controller = new AbortController();
  try {
    let first = true;
    await assert.rejects(
      (async () => {
        for await (const chunk of streamChat({
          baseUrl: `http://127.0.0.1:${port}/v1`,
          apiKey: "test-key",
          model: "mock",
          messages: [{ role: "user", content: "hi" }],
          signal: controller.signal,
        })) {
          assert.equal(chunk, "x");
          if (first) {
            first = false;
            controller.abort();
          }
        }
      })(),
      (error: unknown) => (error as Error).name === "AbortError"
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("流式替换选中文本并正确设置选区", async () => {
  const editor = new MockEditor("hello world");
  editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 });
  const settings = makeSettings({ stream: true });

  await runAction(createMockApp(), editor, "improve", settings, () => {});

  assert.equal(editor.text, "abc world");
  const selection = editor.listSelections()[0];
  assert.deepEqual(selection.anchor, { line: 0, ch: 0 });
  assert.deepEqual(selection.head, { line: 0, ch: 3 });
});

test("流式在光标处续写", async () => {
  const editor = new MockEditor("hello");
  editor.setCursor({ line: 0, ch: 5 });
  const settings = makeSettings({ stream: true });

  await runAction(createMockApp(), editor, "continue", settings, () => {});

  assert.equal(editor.text, "helloabc");
  assert.deepEqual(editor.getCursor(), { line: 0, ch: 8 });
});

test("无选区时回退到 Markdown 段落（连续非空行）", async () => {
  const editor = new MockEditor("first line\nsecond line");
  editor.setCursor({ line: 1, ch: 3 });
  const settings = makeSettings({ stream: true });

  await runAction(createMockApp(), editor, "improve", settings, () => {});

  assert.equal(editor.text, "abc");
  const selection = editor.listSelections()[0];
  assert.deepEqual(selection.anchor, { line: 0, ch: 0 });
  assert.deepEqual(selection.head, { line: 0, ch: 3 });
});

test("空行分隔的段落边界", async () => {
  const editor = new MockEditor("p1 line a\np1 line b\n\np2 line c");
  editor.setCursor({ line: 1, ch: 2 });
  const settings = makeSettings({ stream: true });

  await runAction(createMockApp(), editor, "improve", settings, () => {});

  assert.equal(editor.text, "abc\n\np2 line c");
});

test("长笔记且光标在空行时：以开头为上下文并插入光标处，不覆盖全文", async () => {
  const editor = new MockEditor("0123456789ABC\n\n");
  editor.setCursor({ line: 1, ch: 0 });
  const settings = makeSettings({ stream: true, contextMaxChars: 10 });

  await runAction(createMockApp(), editor, "summarize", settings, () => {});

  assert.equal(editor.text, "0123456789ABC\nabc\n");
  const selection = editor.listSelections()[0];
  assert.deepEqual(selection.anchor, { line: 1, ch: 0 });
  assert.deepEqual(selection.head, { line: 1, ch: 3 });
});

test("非流式一次性替换", async () => {
  const editor = new MockEditor("hello world");
  editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 });
  const settings = makeSettings({ stream: false });

  await runAction(createMockApp(), editor, "improve", settings, () => {});

  assert.equal(editor.text, "XYZ world");
});

test("sanitizeContextMaxChars 对 0 / NaN / 负数 / 字符串兜底", () => {
  assert.equal(sanitizeContextMaxChars(0), 8000);
  assert.equal(sanitizeContextMaxChars(Number.NaN), 8000);
  assert.equal(sanitizeContextMaxChars(-5), 8000);
  assert.equal(sanitizeContextMaxChars("3000"), 3000);
  assert.equal(sanitizeContextMaxChars(5000), 5000);
  assert.equal(sanitizeContextMaxChars(undefined), 8000);
});

test("Ask AI：有选区时优先附带选中内容，而不是整篇笔记", () => {
  const message = buildAskUserMessage({
    includeContext: true,
    contextMaxChars: 8000,
    noteTitle: "测试笔记",
    noteContent: "这是整篇笔记的正文，不应该成为核心上下文。",
    selection: "用户选中的关键段落",
    question: "请总结这段内容",
  });
  assert.match(message, /测试笔记/);
  assert.match(message, /你选中的内容/);
  assert.match(message, /用户选中的关键段落/);
  assert.doesNotMatch(message, /这是整篇笔记的正文/);
  assert.match(message, /请总结这段内容/);
});

test("Ask AI：无选区时附带整篇笔记内容", () => {
  const message = buildAskUserMessage({
    includeContext: true,
    contextMaxChars: 8000,
    noteTitle: "测试笔记",
    noteContent: "笔记正文第一行\n笔记正文第二行",
    selection: "",
    question: "帮我写个开头",
  });
  assert.match(message, /以下是当前笔记《测试笔记》的内容/);
  assert.match(message, /笔记正文第一行/);
  assert.match(message, /笔记正文第二行/);
  assert.match(message, /帮我写个开头/);
});

test("Ask AI：contextMaxChars 为 0 时不会静默丢失上下文", () => {
  const message = buildAskUserMessage({
    includeContext: true,
    contextMaxChars: 0,
    noteTitle: "测试笔记",
    noteContent: "即使设置异常，正文也必须被发送。",
    selection: "",
    question: "你能看到笔记吗",
  });
  assert.match(message, /即使设置异常，正文也必须被发送/);
});

test("Ask AI：includeContext 关闭时只发送问题", () => {
  const message = buildAskUserMessage({
    includeContext: false,
    contextMaxChars: 8000,
    noteTitle: "测试笔记",
    noteContent: "不应出现的正文",
    selection: "",
    question: "单独的问题",
  });
  assert.equal(message, "单独的问题");
});

test("Ask AI：空笔记时明确告知模型内容为空，而非静默丢弃", () => {
  const message = buildAskUserMessage({
    includeContext: true,
    contextMaxChars: 8000,
    noteTitle: "空笔记",
    noteContent: "   ",
    selection: "",
    question: "这篇笔记讲了什么",
  });
  assert.match(message, /当前为空/);
  assert.match(message, /（空）/);
  assert.match(message, /这篇笔记讲了什么/);
});

test("describeAskContext 展示实际附带范围，方便发送前确认", () => {
  assert.match(
    describeAskContext({
      includeContext: true,
      contextMaxChars: 8000,
      noteTitle: "长笔记",
      noteContent: "x".repeat(100),
      selection: "",
    }),
    /长笔记.*100 字/
  );
  assert.match(
    describeAskContext({
      includeContext: true,
      contextMaxChars: 50,
      noteTitle: "长笔记",
      noteContent: "x".repeat(100),
      selection: "",
    }),
    /已截取前 50 字/
  );
  assert.match(
    describeAskContext({
      includeContext: true,
      contextMaxChars: 8000,
      noteTitle: "笔记",
      noteContent: "正文",
      selection: "选中段落",
    }),
    /你选中的内容.*共 4 字.*上限 8000 字/
  );
  assert.match(
    describeAskContext({
      includeContext: false,
      contextMaxChars: 8000,
      noteTitle: "笔记",
      noteContent: "正文",
      selection: "",
    }),
    /仅发送你的问题/
  );
});
