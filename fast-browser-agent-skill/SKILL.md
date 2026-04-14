---
name: fast-browser-agent
description: 使用 fast-browser CLI 操作网站、复用或创建 site adapter，并把稳定能力沉淀为 command、flow、case。
---

# Fast-Browser Agent

## 用途
当 Agent 需要通过 `fast-browser` CLI 操作网站、复用或创建 site adapter、并把稳定能力沉淀为 `command / flow / case` 时使用。

## 目标
这个 skill 用来约束 Agent 正确使用 `fast-browser`：
- 优先复用已有 `case / flow / site`
- 只在必要时使用低层浏览器命令探索
- 基于 `trace current --json` 沉淀稳定资产
- 在多 session 场景下固定使用 `--session-id`
- 正确处理 `tab`、登录态、profile clone 与 adapter 资产目录

## 能力优先级
固定优先级：
1. `case run`
2. `flow run`
3. `site <adapter>/<command>`
4. 低层浏览器命令

不要一开始就用 `snapshot`、`eval`、原始 selector。

## 预检
开始任务前先自动执行：

```bash
fast-browser health
fast-browser workspace --json
fast-browser browser status --json
fast-browser list
```

如果是已有站点，再执行：

```bash
fast-browser info <site> --json
fast-browser info <site>/<command> --json
```

目的：
- 确认当前 workspace 与 `adaptersDir`
- 确认浏览器隔离模式
- 确认已有 adapter / command / flow / case
- 确认 command 的正式参数，避免靠猜

## 多 Session 规则
只要任务涉及多个 Agent 或多个 session：
- 全程显式带 `--session-id`
- 一个任务只使用一个稳定的 `--session-id`
- 中途不要切换 `--session-id`
- 如果没有显式 `--session-id`，不要继续做多 session 验证

示例：

```bash
fast-browser --session-id zhihu-a open "https://www.zhihu.com/hot" --headed
fast-browser --session-id zhihu-a snapshot -i --json
```

开始站点任务前先看：

```bash
fast-browser --session-id <id> workspace --json
fast-browser --session-id <id> browser status --json
```

重点字段：
- `sessionId`
- `browserIsolationMode`
- `browserProfileDir`
- `browserStateFilePath`

## 登录态与认证同步
如果站点依赖登录态继承：
1. 先在源 session 验证已登录
2. 再执行：

```bash
fast-browser --session-id <source> auth sync
```

3. 然后新建 fresh session 验证是否继承登录态

不要把“当前页面已登录”误当成“别的 session 已自动继承登录态”。

如果站点需要人工登录，Agent 必须主动负责打开窗口，而不是只口头要求人类自己处理：
1. 固定一个稳定的 `--session-id`
2. 用 `--headed` 打开目标网站的登录页或相关页面
3. 明确告诉人类“请在刚打开的窗口里完成登录，完成后回复：已登录”
4. 人类确认后，再执行：

```bash
fast-browser --session-id <id> auth sync
```

5. 然后再从稳定的 post-login 页面继续执行 `site / flow / case`

不要在需要人工登录时只说“请登录”，却不先由 Agent 打开对应窗口。

## Tab 规则
多 tab 场景优先用正式命令：

```bash
fast-browser tab list --json
fast-browser tab new --url "<url>"
fast-browser tab switch --id "<tabId>"
fast-browser tab close --id "<tabId>"
```

补充说明：
- `tab new --url` 是正式推荐写法
- `tab switch --id` / `tab close --id` 是正式推荐写法
- `tab switch` 后，后续低层命令、`site`、`flow`、`case` 都绑定当前活动 tab
- 不要假设 `open` 一定会新开 tab
- 不要假设 `site` 或 `flow` 会自动跳回旧 tab

## 低层探索规则
只有在高层资产不足时才使用低层命令。

常用序列：

```bash
fast-browser snapshot -i --json
fast-browser click --target "@e57"
fast-browser fill --target "@e12" "hello"
fast-browser press Enter
fast-browser waitForSelector <selector> --state visible
```

规则：
- 在 PowerShell 里，snapshot ref 一律通过 `--target "@eN"` 传入
- `snapshot` 和 `@eN` 只用于探索，不应直接进入最终保存的 `flow` 或 `case`
- 有明确成功信号时，优先看 URL、title、selector、页面内容变化

## Trace 与沉淀
正式沉淀输入固定来自：

```bash
fast-browser trace current --json
```

先打边界：

```bash
fast-browser trace mark --type goal_start --label "<goal>"
fast-browser trace mark --type goal_success --label "<goal>"
```

再读取：

```bash
fast-browser trace current --json
```

沉淀规则：
- `command`：稳定、原子的站点能力
- `flow`：复用多个稳定步骤实现一个目标
- `case`：建立在 `flow` 之上的验证语义

不要主要依赖聊天上下文去回忆流程。

## Command / Flow / Case 正式沉淀路径
优先使用 CLI 的正式沉淀路径：

```bash
fast-browser command save --site <site> --from-trace --id <commandId> --goal "<goal>"
fast-browser command materialize --draft <draft-path>
fast-browser flow save --site <site> --from-trace --id <flowId> --goal "<goal>"
fast-browser case save --site <site> --id <caseId> --goal "<goal>" --flow <flowId>
```

可选增强：

```bash
fast-browser case save --site <site> --id <caseId> --goal "<goal>" --flow <flowId> --url-includes "/path" --title-not-empty
```

沉淀前必须确认：
- `trace current --json` 已成功
- `command save --from-trace` 产物是 draft，不是正式 adapter 代码
- command draft 默认落在 `.fast-browser/sessions/<session>/drafts/commands/<site>/...`
- `command materialize --draft` 只输出补丁建议，不会直接修改 adapter 源码
- 正式资产必须落到当前 workspace 的 `src/adapters/<site>/...`
- 不要把 `.fast-browser/sessions/...` 里的临时草稿当成正式 adapter 资产

沉淀后必须验证：

```bash
fast-browser flow list <site>
fast-browser case list <site>
fast-browser flow run <site>/<flow>
fast-browser case run <site>/<case>
```

如果已经把 command 正式落到 adapter 目录，还应继续验证：

```bash
fast-browser info <site>/<command> --json
fast-browser site <site>/<command> --input '{...}'
```

## Flow 允许保存什么
`flow` 默认作用于当前活动 tab。

当前允许直接进入正式 flow 的 builtin：
- `open`
- `wait`
- `waitForSelector`
- `tabNew`
- `tabSwitch`
- `click`
- `fill`
- `press`

但要满足：
- `tabSwitch` 使用相对语义，如 `previous` / `lastCreated`
- `click` / `fill` / `press` 必须能稳定表达为 target
- 不要把裸 `@eN`、真实 tabId、一次性运行时 selector 直接存进 flow
- 如果 trace 中的交互 target 无法稳定化，应该拒绝自动生成 flow，而不是保存错误 flow
- 如果 trace 里没有稳定起点（`site` 或 `open`），不要强行保存 flow；应从稳定入口重跑，再执行 `flow save --from-trace`

## 新站点起步
新网站优先做：
1. 找稳定直达路由
2. 再执行：

```bash
fast-browser guide inspect --url <url>
fast-browser guide plan ...
fast-browser guide scaffold ...
```

3. 检查生成文件是否落在：
- `src/adapters/<site>/...`

`guide` 是骨架器，不是成熟 adapter 生成器。复杂站点最终仍然要靠真实任务 + `trace current` 收敛。

## 验收边界
外部站点专用 skill / CLI / MCP：
- 只能辅助探索
- 不能算 Fast-Browser adapter 已完成

如果关键执行链借助了外部站点专用工具，只能标记为：
- `exploration-assisted`

最终验收必须回到 Fast-Browser 自己的：
- `site`
- `flow`
- `case`
- 或必要的低层命令

## 参考文件
按需读取：
- [references/agent-workflow.md](references/agent-workflow.md)
- [references/browser-recipes.md](references/browser-recipes.md)
- [references/trace-to-command.md](references/trace-to-command.md)
- [references/trace-to-flow.md](references/trace-to-flow.md)
- [references/new-site-bootstrap.md](references/new-site-bootstrap.md)
- [references/storage-location.md](references/storage-location.md)
