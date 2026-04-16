---
name: fast-browser-agent
description: Use when an agent needs to operate websites through the fast-browser CLI, reuse or create site adapters, or promote successful browser work into reusable commands, flows, and cases.
---

# Fast-Browser Agent

## 用途
当 Agent 需要通过 `fast-browser` CLI 操作网站、复用或创建 site adapter，或把成功路径沉淀为 `command / flow / case` 时使用。

## 核心原则

固定优先级：

1. `case run`
2. `flow run`
3. `site <adapter>/<command>`
4. 低层浏览器命令

不要一上来就依赖 `snapshot`、`eval`、裸 selector，或聊天上下文里的模糊回忆。

## Agent 自动做

下面这些事情默认由 Agent 自己完成，不应把实现细节甩给用户：

- preflight：`health / workspace / browser status / list`
- 已有站点能力盘点：`info <site>`、`info <site>/<command>`
- 登录完成后的认证状态同步，例如 `auth sync`
- 正式沉淀前读取 `trace current --json`
- 沉淀后重新验证 `site / flow / case` 是否真的可复用

最小 preflight：

```bash
fast-browser health
fast-browser workspace --json
fast-browser browser status --json
fast-browser list
```

如果是已有站点，再补：

```bash
fast-browser info <site> --json
fast-browser info <site>/<command> --json
```

## Agent 必须提示用户

下面这些事情不要擅自假设，应主动提示用户或请求确认：

- 是否需要启用 `--session-id` 策略
- 是否需要人工登录
- 是否允许打开 `--headed` 浏览器窗口
- 本次任务跑通后是否准备沉淀为 `command / flow / case`

不要把下面这些话术交给用户：

- “请你自己做 auth sync”
- “请你自己决定 session-id 怎么配”
- “请你自己处理登录后的浏览器状态”

## Session 策略

`--session-id` 不是每次都要开的默认参数，而是一种运行策略。以下场景应主动提示用户为什么可能需要它：

- 多 Agent 并发操作同一站点
- 任务跨多个阶段，需要稳定继承浏览器上下文
- 需要把人工登录、后续执行、沉淀验证放在同一个稳定 session 内
- 需要验证 session clone、登录态继承或隔离行为

一旦决定使用，就要遵守：

- 全程显式固定一个稳定的 `--session-id`
- 一个任务只使用一个 `--session-id`
- 中途不要切换到别的 `session-id`

## 登录规则

如果需要人工登录：

1. 先判断本次是否应固定 `--session-id`
2. 用 `--headed` 打开登录页或相关入口
3. 明确告诉用户在刚打开的窗口内完成登录，并在完成后回复“已登录”
4. 用户确认后，Agent 自行执行认证状态同步
5. 再从稳定的 post-login 页面继续跑 `site / flow / case`

不要只说“请登录”，却不先由 Agent 打开对应窗口。

## 低层探索边界

只有在高层资产不够时才使用低层命令。PowerShell 下，snapshot ref 一律通过 `--target "@eN"` 传入。

常用序列：

```bash
fast-browser snapshot -i --json
fast-browser click --target "@e57"
fast-browser fill --target "@e12" "hello"
fast-browser press Enter
fast-browser waitForSelector "<selector>" --state visible
```

不要把 `snapshot`、裸 `@eN`、真实 tabId、一次性 selector 直接保存进正式 `flow` 或 `case`。

## 沉淀规则

正式沉淀前必须先读：

```bash
fast-browser trace current --json
```

判断原则：

- `command`：稳定、原子的站点动作
- `flow`：由多个稳定步骤组成的可复用目标路径
- `case`：建立在 `flow` 之上的验证语义

正式路径：

```bash
fast-browser command save --site <site> --from-trace --id <commandId> --goal "<goal>"
fast-browser command materialize --draft <draft-path>
fast-browser flow save --site <site> --from-trace --id <flowId> --goal "<goal>"
fast-browser case save --site <site> --id <caseId> --goal "<goal>" --flow <flowId>
```

不要把 `.fast-browser/sessions/...` 下的临时草稿当正式资产。正式资产必须落到当前 workspace 的 `src/adapters/<site>/...`。

更细的提升标准看：

- [references/promotion-rules.md](references/promotion-rules.md)
- [references/trace-to-command.md](references/trace-to-command.md)
- [references/trace-to-flow.md](references/trace-to-flow.md)
- [references/trace-to-case.md](references/trace-to-case.md)

## 新站点起步

新网站先找稳定直达入口，再用 `guide` 起骨架，不要先固化首页壳层点击。

```bash
fast-browser workspace --json
fast-browser guide inspect --url <url>
fast-browser guide plan --platform <site> --url <url> --capability "<capability>"
fast-browser guide scaffold --platform <site> --url <url> --capability "<capability>"
```

`guide` 只负责 starter，不是成熟 adapter 生成器。复杂站点仍要靠真实任务和 `trace current` 收敛。

更细规则看：

- [references/new-site-bootstrap.md](references/new-site-bootstrap.md)
- [references/storage-location.md](references/storage-location.md)

## 验收边界

外部站点专用 skill / CLI / MCP 只能辅助探索，不能直接算 Fast-Browser adapter 已完成。

最终验收必须回到 Fast-Browser 自己的：

- `site`
- `flow`
- `case`
- 或必要的低层命令

## 按需参考

- [references/browser-recipes.md](references/browser-recipes.md)
- [references/capability-priority.md](references/capability-priority.md)
