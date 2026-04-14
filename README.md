# Fast-Browser

Fast-Browser 是一个面向 AI Agent 的纯本地浏览器 CLI。

它的目标不是替代传统的人类测试框架，而是提供一套统一的浏览器控制、站点适配、流程复用和测试编排能力，让 Agent 可以：
- 操作真实浏览器
- 沉淀站点能力为 `command`
- 编排高频操作为 `flow`
- 把验证场景沉淀为 `case`
- 逐步减少对 `snapshot`、`eval`、临时 selector 的依赖

## 当前能力

Fast-Browser 当前有五层能力：

1. 低层浏览器命令  
   例如 `open`、`snapshot`、`click`、`fill`、`type`、`press`、`waitForSelector`、`console`、`network`、`storage`、`tab`。

2. 站点能力  
   通过 `site <adapter>/<command>` 调用已沉淀的站点命令。

3. `guide`  
   用于新站点冷启动，只负责生成 adapter 骨架和 starter flow，不负责自动学习。

4. `flow`  
   用于复用多步任务。当前正式 DSL 允许：
   - `site`
   - builtin `open`
   - builtin `wait`
   - builtin `waitForSelector`
   - builtin `tabNew`
   - builtin `tabSwitch`
   - builtin `click`
   - builtin `fill`
   - builtin `press`

5. `case`  
   用于验证场景，建立在 `flow` 之上。

## 核心原则

- `command` 是原子站点能力。
- `flow` 是复合高频任务。
- `case` 是验证语义，不直接承载 DOM 级脚本。
- `guide` 是骨架器，不是自动学习系统。
- `trace current` 是沉淀 `command / flow / case` 的唯一正式输入。

## 工作流

### 1. Preflight

Agent 在任何站点任务开始前，应自动执行：

```bash
fast-browser health
fast-browser workspace --json
fast-browser browser status --json
fast-browser auth sync
fast-browser session cleanup --max-age-hours 24
fast-browser list
# 如需保留当前 session clone，可显式执行 pin
fast-browser session pin
```

如果 `workspace --json` 或 `browser status --json` 返回 `browserIsolationMode: "session-clone"` 或 `notice`，说明 Fast-Browser 正在为当前会话使用隔离浏览器实例和 clone profile。此时 Agent 应从任务开始就固定一个稳定的 `--session-id`，并在整条命令链里持续复用，例如：`fast-browser --session-id zhihu-hot-20260327-a ...`。

### 1.1 登录态过期或需要人工登录时

如果网站依赖登录态，而当前 cookie 已过期或本次任务需要人工登录，标准流程是：

1. Agent 固定一个稳定的 `--session-id`
2. Agent 用 `--headed` 打开目标网站的登录页或相关页面
3. Agent 明确要求人类在刚打开的窗口里完成登录
4. 人类登录完成后回复“已登录”
5. Agent 执行：

```bash
fast-browser --session-id <id> auth sync
```

6. 然后 Agent 再从稳定的 post-login 页面继续运行业务 `flow / case`

也就是说：
- 登录窗口由 Agent 主动打开
- 人工只负责在该窗口内完成登录
- 普通业务 flow 不自动包含登录流程
- 登录态问题先在 `session/profile/auth` 层解决，再进入业务 flow

### 2. 复用优先级

优先级永远是：

1. `case run`
2. `flow run`
3. `site <adapter>/<command>`
4. 低层浏览器命令

### 3. trace 边界

如果本次任务准备沉淀能力，应该从一开始就打 trace 边界：

```bash
fast-browser trace mark --type goal_start --label "<goal>"
fast-browser trace mark --type checkpoint --label "<checkpoint>"
fast-browser trace mark --type goal_success --label "<goal>"
```

### 4. 保存前必须读 `trace current`

保存 `command / flow / case` 前，必须先执行：

```bash
fast-browser trace current --json
```

当前 `trace current` 不再是原始流水账，而是“沉淀视图”：
- `entries[]`：清洗后的成功路径
- `discarded[]`：失败分支和噪音
- `locator.resolvedSelector`
- `locator.selectorCandidates`
- `signal.settled`
- `signal.urlChanged`
- `signal.titleChanged`
- `flowSafe`
- `commandCandidate`
- `notes[]`

`trace latest` 继续保留原始事件，只用于调试。

### 5. 保存链路

```bash
fast-browser command save --site <site> --from-trace --id <commandId> --goal "<goal>"
fast-browser command materialize --draft <draft-path>

fast-browser flow save --site <site> --file <flow.json>
fast-browser flow save --site <site> --from-trace --id <flowId> --goal "<goal>"
fast-browser flow list <site>
fast-browser flow run <site>/<flow> --input '{...}'

fast-browser case save --site <site> --file <case.json>
fast-browser case save --site <site> --id <caseId> --goal "<goal>" --flow <flowId>
fast-browser case list <site>
fast-browser case run <site>/<case> --input '{...}'
```

当前推荐的沉淀顺序是：
1. `trace current --json`
2. 先判断成功路径里哪些步骤应该提升成 `command`
3. 对原子能力执行 `command save --from-trace`
4. 如需补丁建议，再执行 `command materialize --draft <draft-path>`
5. 把剩余复合目标沉淀成 `flow`
6. 最后再把验收目标沉淀成 `case`

需要注意：
- `command save --from-trace` 当前生成的是 command draft，不是正式 adapter 代码
- draft 默认落在 `.fast-browser/sessions/<session>/drafts/commands/<site>/...`
- `command materialize --draft` 会给出 `manifest.json`、`commands/*.ts`、必要时 `index.ts` 的补丁建议，但不会直接改 adapter 源码
- 正式 adapter 资产仍应落到 `src/adapters/<site>/...`

当前 `flow save` / `case save` 已经有 CLI 级硬约束：
- 必须存在最近一次成功的 `trace current`
- 文件名与 `id` 必须一致
- 引用的 `flow` / `command` 必须真实存在
- `flow save --from-trace` 只有在步骤能稳定表达时才会生成 draft；如果 target 或 tab 语义无法稳定化，会明确拒绝
- 如果 trace 里缺少稳定起点（site 或 open），会拒绝生成依赖当前浏览器上下文的 flow

## 低层命令现状

当前低层命令已经比早期更接近真实业务交互：

- `type`  
  如果键盘输入没有实际生效，会回退到 DOM setter。

- `press Enter`  
  对带目标的输入场景，会尝试表单提交和 blur 兜底。

- `click`  
  遇到瞬时上下文错误时会恢复后重试，再退回 DOM 事件兜底。

- `snapshot/ref`  
  现在保存更丰富的 ref 信息：
  - `selector`
  - `selectors`
  - `text`
  - `tag`

  `@eN` 解析时会优先使用仍然存活的 selector 候选，失效时再尝试语义回退。

- 动作结果  
  现在会带 `signal`，至少包含：
  - `settled`
  - `urlChanged`
  - `titleChanged`

这些信号不是最终业务成功判定，但可以帮助 Agent 区分：
- 只是一次 DOM 动作
- 还是页面级状态确实发生了变化

## `flow` / `case` 边界

### `flow`

`flow` 当前保存“稳定编排 + 轻量交互”，默认作用于当前活动 tab。

当前允许直接进入正式 `flow` 的步骤：
- `site`
- `open`
- `wait`
- `waitForSelector`
- `tabNew`
- `tabSwitch`
- `click`
- `fill`
- `press`

限制规则：
- `tabSwitch` 不保存真实 tabId，只保存相对语义，例如 `previous`、`lastCreated`
- `click` / `fill` / `press` 必须能稳定表达为 target，不能直接保存裸 `@eN`
- `press` 支持单键或最多两个键的组合键

不要把这些直接写进已保存的 `flow`：
- `snapshot`
- `eval`
- `type`
- `hover`
- `console`
- `network`
- 裸 `@eN`
- 真实 tabId

如果低层探索步骤无法稳定化为正式 builtin 或站点 `command`，就不应自动生成 flow，而应提示 Agent 手工整理。

### `case`

`case` 当前只复用 `flow`，不直接承载 DOM 级行为。

## `guide` 的定位

`guide` 当前只负责：
- 页面分析
- 参数推断
- 生成 adapter 骨架
- 生成 starter flow

当前生成的 starter command / flow 已经更偏向：
- 稳定直达路由
- 明确成功信号
- starter flow 带 `urlIncludes` 断言

但它仍然不是成熟 adapter 生成器。复杂站点最终仍应依赖：
- 真实任务
- `trace current`
- Agent 的总结与沉淀

## 浏览器 Profile 架构原则（正式）

这一部分是 Fast-Browser 的正式架构原则。

### 当前已实现

- 浏览器登录态母本使用用户级全局 profile：`%USERPROFILE%\.fast-browser\chrome-profile`
- 多 Agent / 多 session 场景下，可以通过稳定的 `--session-id` 进入 `session-clone` 模式
- `session-clone` 模式会为每个 session 准备独立的 clone profile、browser meta state、trace 与运行态文件

### 正式架构原则

- `base profile`：长期保存，只承担认证母本，不直接承载并发任务上下文。
- `session clone profile`：每个 Agent session 使用独立 clone profile 和独立浏览器实例；它是运行时副本，不是长期资产。
- `auth sync`：认证状态应以“登录态变化”为触发条件回写到 `base profile`，不依赖“session 结束”这种不可靠事件。
- `session lifecycle`：session clone 应按 `active / idle / expired` 管理，而不是简单按命令进程是否退出来判断。
- `cleanup`：clone profile 视为可回收缓存，只在确认非活跃、可恢复后才清理。
- `recover`：clone 被清理后，后续 session 应恢复登录态，但不承诺恢复旧 tab、旧页面、旧 ref 上下文。

### 架构取舍结论

Fast-Browser 当前正式选择：
- 多 Agent / 多 session 隔离：`base profile + session clone profile + 独立浏览器实例`
- 单个 session 内多页面切换：`tab`

不采用“同 profile + 仅靠 tab 标记隔离多 Agent”的原因是：
- 维护复杂度更高
- 问题定位复杂度更高
- 对 CLI 并发自动化更不稳定

## 目录规则

Fast-Browser 的默认 workspace 是 CLI 包根目录。

默认资产目录：

```text
<workspace>/src/adapters/<site>/manifest.json
<workspace>/src/adapters/<site>/commands/*.ts
<workspace>/src/adapters/<site>/flows/*.flow.json
<workspace>/src/adapters/<site>/cases/*.case.json
```

浏览器登录态默认是用户级共享：

```text
%USERPROFILE%\.fast-browser\chrome-profile
%USERPROFILE%\.fast-browser\sessions\browser-state.json
```

## 参考文档

- [人类操作手册](D:\AIWorks\skills\fast-browser\docs\HUMAN_OPERATOR_GUIDE.md)
- [Agent 工作流](D:\AIWorks\skills\fast-browser\docs\AGENT_WORKFLOW.md)
- [从 trace 提炼 command](D:\AIWorks\skills\fast-browser\docs\TRACE_TO_COMMAND_GUIDE.md)
- [从 trace 提炼 flow](D:\AIWorks\skills\fast-browser\docs\TRACE_TO_FLOW_GUIDE.md)
- [PRD](D:\AIWorks\skills\fast-browser\fast-browser-prd.md)

