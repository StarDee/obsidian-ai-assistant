# Obsidian AI Assistant（Obsidian 插件）

一个 Obsidian 写作辅助插件：在编辑笔记时调用大模型能力，自动**生成、优化、总结、扩写、精简、翻译、改语气**笔记内容，体验参考 Notion AI。支持任意 OpenAI 兼容接口，内置 DeepSeek、OpenAI、Kimi、智谱 GLM、SiliconFlow、Ollama 等预设，可一键切换。

## 功能特性

- **11 种写作操作**：优化文本、继续写作、修复拼写与语法、总结、扩写、精简、改变语气、翻译、生成大纲、转为要点列表、解释所选内容
- **Ask AI 提问**：向模型提问并直接把回答插入笔记，生成过程实时流式显示
- **流式输出**：AI 结果逐字写入笔记，接近 Notion AI 的即时反馈体验（可在设置中关闭）
- **多模型可配置**：DeepSeek / OpenAI / Moonshot / 智谱 / SiliconFlow / Ollama / 任意 OpenAI 兼容服务，支持自定义 Base URL、模型名、API Key、温度、最大 Token
- **智能选区回退**：没有选中文本时自动使用当前段落（或短笔记全文）作为处理对象
- **编辑菜单集成**：右键菜单直接调用 AI 操作；命令面板可搜索全部操作并自定义快捷键
- **可自定义提示词**：每个操作对应一条可编辑的提示词模板
- **测试连接**：设置页一键验证服务商、密钥与模型是否可用

## 支持的模型服务商

| 服务商 | Base URL（自动填充） | 默认模型 |
| --- | --- | --- |
| DeepSeek（推荐） | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Moonshot（Kimi） | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| SiliconFlow 硅基流动 | `https://api.siliconflow.cn/v1` | `deepseek-ai/DeepSeek-V3` |
| Ollama（本地） | `http://localhost:11434/v1` | `llama3.1` |
| 自定义 | 任意 OpenAI 兼容地址 | 自填 |

也可以选择“自定义”，填写任意 OpenAI 兼容接口的 Base URL 与模型名。

## 安装

### 方法一：直接使用（推荐）

1. 在 Obsidian 中打开目标 vault，进入 `设置 → 第三方插件`，开启“社区插件”（若旧版本仍显示“安全模式”开关，则将其关闭）
2. 获取构建产物：从 npm 包或发布版本中取 `dist/` 目录，或本地执行 `pnpm run build` 生成；把 `dist` 下的 `manifest.json`、`main.js`、`styles.css` 三个文件复制到 vault 下的插件目录（Windows 上 `.obsidian` 是隐藏文件夹，需要先在系统设置中“显示隐藏的项目”）：

   ```text
   你的vault/.obsidian/plugins/obsidian-ai-assistant/
   ```

   > 插件目录名必须与 `manifest.json` 中的 `id` 一致（`obsidian-ai-assistant`），否则 Obsidian 无法识别。

3. 如果插件未出现在列表中，重启 Obsidian 或重新进入设置页；在 Obsidian 设置中启用 **Obsidian AI Assistant** 插件
4. 进入插件设置，选择服务商（如 DeepSeek），填入 API Key，点击“发送测试请求”验证

### 方法二：从源码构建

```bash
pnpm install
pnpm run build
```

构建产物会生成在 `dist/` 目录：`dist/main.js`（打包产物）以及复制过来的 `manifest.json`、`styles.css`、`versions.json`。

> 注意：`dist/` 已加入 `.gitignore`，发布产物不提交到源码仓库，由 `pnpm run build` / `pnpm publish` 生成。

## 快速开始（以 DeepSeek 为例）

1. 到 [DeepSeek 开放平台](https://platform.deepseek.com) 注册并创建 API Key（格式 `sk-...`）
2. Obsidian 中打开 `设置 → Obsidian AI Assistant`
3. 服务商选择 **DeepSeek**（Base URL 与模型会自动填充为 `https://api.deepseek.com/v1` 和 `deepseek-chat`）
4. 粘贴 API Key，点击“发送测试请求”，提示“连接成功”即可
5. 打开任意笔记，选中一段文字，右键 → **AI 优化文本**，或打开命令面板搜索“AI”

## 使用方式

### 命令面板

所有操作都以命令注册，可在 `设置 → 快捷键` 中为常用操作绑定快捷键。建议绑定：

- 优化文本：如 `Ctrl+Shift+I`
- 继续写作：如 `Ctrl+J`
- Ask AI：如 `Ctrl+Shift+A`

### 右键菜单（编辑模式）

选中文本后右键，可直接调用：AI 优化文本、AI 继续写作、AI 总结、AI 修复语法、AI 改变语气、AI 翻译、AI 解释所选内容、Ask AI。

### Ask AI

命令面板执行 **Ask AI：提问并插入到笔记**，输入问题（如“帮我为这篇笔记写一个开头”），生成结果会实时显示，点击“插入到笔记”写入光标处，也可以复制或停止生成。**无需手动选中文本**：提问时会自动把当前笔记内容作为上下文发送给模型（可在设置中关闭，或调整“上下文最大字符数”）。

### 无选区时

未选中文本时，插件会自动确定上下文，无需手动选中，按以下优先级：

1. **光标所在的 Markdown 段落**（以空行分隔的文本块）作为处理对象
2. 段落为空且整篇笔记较短（≤ 上下文上限，默认 8000 字符）时，使用整篇笔记
3. 笔记较长时，把笔记开头作为上下文，并把结果**插入光标处**（不会误覆盖整篇笔记）
4. 空笔记时“继续写作”会直接生成一个开头

上限可在设置 → “上下文最大字符数”中调整。

## 自定义提示词

设置页底部可编辑每个操作的系统提示词与模板，支持占位符：

| 占位符 | 含义 |
| --- | --- |
| `{{selection}}` | 选中文本 / 当前段落 / 整篇笔记 |
| `{{context}}` | 笔记标题与笔记开头（上下文参考） |
| `{{tone}}` | 改变语气时选择的语气 |
| `{{language}}` | 翻译时选择的目标语言 |

示例：将“优化文本”提示词改为

```text
请用{{tone}}的语气优化以下文本，输出 Markdown：
{{selection}}
```

并保持 `{{tone}}` 对应的操作弹窗选择语气，即可实现自定义风格优化。

## 性能与成本优化

- **成本控制**：上下文默认上限 8000 字符（设置 → “上下文最大字符数”可调），单次输出上限 `maxTokens`，避免无效 token 消耗
- **流式批处理**：生成内容按约 40ms 的小批量写入编辑器，而不是每个 token 都触发一次编辑器更新，减少大笔记/长文本生成时的卡顿
- **并发保护**：同一时间只允许一个 AI 请求（编辑操作或 Ask AI），重复触发会提示“已有 AI 操作正在进行”，防止误触浪费额度
- **服务端前缀缓存**：DeepSeek、OpenAI 等提供商会自动缓存重复请求前缀（相同的系统提示词 + 笔记内容）。Ask AI 把稳定的笔记上下文放在消息前缀、把指令放在末尾，可最大化命中自动缓存从而降低费用
- **不做本地结果缓存**：模型带温度（默认 0.7）生成时结果本身有随机性，本地缓存相同输入容易返回“陈旧”结果造成困惑，因此刻意不做；如确实需要可另加设置项

## 常见问题

**提示“API Key 无效或未配置（401）”**：检查 API Key 是否复制完整、服务商是否选择正确，并使用“发送测试请求”验证。

**提示“接口地址不正确（404）”**：检查 Base URL 是否为 OpenAI 兼容格式（插件会自动拼接 `/chat/completions`）。注意：若服务商给的地址本身已包含 `/chat/completions`，直接粘贴即可，插件不会重复拼接。

**提示“请求过于频繁或额度不足（429）”**：账户余额不足或触发限流，稍后重试或降低“温度”/“最大输出 Token”。

**Ollama 本地服务连不上**：确认 Ollama 已启动并开启 OpenAI 兼容接口（默认 `http://localhost:11434/v1`），模型名改为实际已拉取的模型（如 `llama3.1`、`qwen2.5`）。

**生成到一半停止/超时**：长文本生成可在设置中增大“请求超时（秒）”与“最大输出 Token”；也可以关闭“流式输出”改为一次性写入。

**手机上使用**：插件不是仅桌面端（`isDesktopOnly: false`），但手机端需要服务商支持跨域（CORS），部分服务（尤其本地 Ollama）不可用，建议桌面端使用。

## 安全说明

- API Key 仅保存在本机 vault 的 `data.json` 中，不会被上传到其他服务器
- 发送给模型的仅包含：系统提示词、你选中的文本/当前段落（可选笔记标题与开头）、提示词模板
- 请勿在包含敏感信息的笔记上使用不受信任的第三方服务

## 开发与测试

```bash
pnpm install        # 安装依赖
pnpm run dev        # 监听模式开发（esbuild watch）
pnpm run build      # 类型检查 + 生产构建
pnpm test           # 运行本地测试（mock SSE 服务 + mock 编辑器）
pnpm pack --dry-run # 预览 npm 包将要包含的文件
```

### 目录结构

```text
manifest.json        # 插件清单
styles.css           # 界面样式
dist/                # 构建产物（npm 发布内容，含 manifest/main/styles/versions）
src/
  main.ts            # 插件入口：命令、右键菜单、Ask AI
  settings.ts        # 设置面板、服务商预设
  llm.ts             # OpenAI 兼容调用（流式/非流式、错误处理）
  editor-actions.ts  # 选区/光标位置计算与结果写入
  actions.ts         # 操作定义与默认提示词
  modals.ts          # 语气/语言选择、Ask AI 弹窗
scripts/
  prepare-dist.mjs   # 构建后复制静态文件到 dist/
test/                # 本地自动化测试（无需真实 API）
```

## 发布到 npm

本项目将构建产物单独放在 `dist/` 目录，`package.json` 已配置好发布元数据（`files: ["dist"]`、`prepublishOnly` 自动构建 + 测试）。发布步骤：

1. 检查包名是否可用：`pnpm view obsidian-ai-assistant`。若已被占用，请改成一个唯一的包名，包名与 Obsidian 插件 id（`obsidian-ai-assistant`）互不影响
2. 确认仓库地址后：`pnpm login`
3. 预览发布内容：`pnpm pack --dry-run`，应只包含 `dist/` 下文件以及 `README.md`、`LICENSE`、`package.json`
4. 发布：`pnpm publish`（会自动执行 `pnpm run build && pnpm test`，保证发布的是最新且测试通过的构建）

安装方拿到 npm 包后，将 `dist` 下三个文件（`manifest.json`、`main.js`、`styles.css`）复制到 vault 的 `.obsidian/plugins/obsidian-ai-assistant/` 目录即可——**Obsidian 不会从 `node_modules` 自动加载插件**，目录名必须与 manifest 中的 `id` 一致；桌面端也可以对插件目录创建符号链接以便 npm 更新后自动同步，移动端不支持。

## 免责声明

本项目为开源学习项目，与 Obsidian 官方无关。生成的文本由大模型产生，使用前请自行核验准确性，并对由 API Key 泄露或第三方服务造成的损失自行负责。
