# Fast-Browser 人类操作手册

这份手册写给“通过 Agent + Fast-Browser 自动化操作网页”的人类使用者。

目标不是让你手写浏览器脚本，而是让你知道：
- 什么时候先复用已有 `case / flow / command`
- 什么时候让 Agent 创建 adapter 骨架
- 什么时候要求 Agent 打 `trace mark`
- 什么时候要求 Agent 基于 `trace current` 沉淀 `command / flow / case`

## 一句话记忆

Fast-Browser 的优先级永远是：
1. `case run`
2. `flow run`
3. `site <adapter>/<command>`
4. 低层浏览器命令

也就是说：
- 不要一上来就让 Agent `snapshot`、`eval`、找 selector
- 先让它检查有没有现成的 `case / flow / command`
- 只有没有复用能力时，才回退到低层命令探索

## 人类给 Agent 的推荐流程

### 场景 A：网站已经适配过

你可以直接这样说：

```text
先做 fast-browser preflight，确认当前 workspace 和已存在的能力。优先复用 case、flow、site command，不要先从 snapshot 开始。
```

Agent 应该自动做：
- `fast-browser health`
- `fast-browser workspace --json`
- `fast-browser list`
- 先执行 `fast-browser info <site>/<command> --json`，不要靠猜 command 名和参数
- 检查当前站点已有的 `case / flow / command`

### 场景 B：这是新网站，或还没有可复用能力

你可以这样说：

```text
这是一个新站点。先确认 fast-browser workspace，再找最稳定的入口路由，用 guide 起 adapter 骨架。不要优先固化首页壳层点击。
```

Agent 应该自动做：
- `fast-browser workspace --json`
- `fast-browser guide inspect --url <url>`
- `fast-browser guide plan ...`
- `fast-browser guide scaffold ...`
- 检查生成的 `manifest.json`、`commands/*.ts`、`flows/*.flow.json`

## 什么时候必须要求 Agent 打 trace

只要这次任务打算沉淀成可复用能力，就应该要求 Agent 从一开始打 trace 边界。

推荐话术：

```text
这次任务需要沉淀成可复用能力。请从 goal_start 开始记录 trace，关键节点打 checkpoint，成功后打 goal_success，并基于这段成功路径总结 command 或 flow。
```

Agent 应该执行：

```bash
fast-browser trace mark --type goal_start --label "<goal>"
fast-browser trace mark --type checkpoint --label "<checkpoint>"
fast-browser trace mark --type goal_success --label "<goal>"
```

## 现在最重要的规则：保存前必须读 `trace current`

现在不要再让 Agent 直接根据聊天上下文或自己的工作记忆去总结 `flow / case`。

保存前必须让它执行：

```bash
fast-browser trace current --json
```

理解方式：
- `trace latest` 是原始事件日志，主要给调试看
- `trace current` 是已经清洗过的“成功路径视图”，给 Agent 做沉淀用

现在 `trace current` 里除了步骤本身，还会尽量给出：
- `locator.resolvedSelector`
- `locator.selectorCandidates`
- `signal.settled`
- `signal.urlChanged`
- `signal.titleChanged`
- `flowSafe`
- `commandCandidate`

Agent 应该这样用它：
- 看 `entries[]`：这是当前目标的成功步骤
- 看 `discarded[]`：这些失败步骤不要沉淀
- 看 `flowSafe`：只有 `true` 的步骤才可能直接进 flow
- 看 `commandCandidate`：说明这一步更适合先提升成 adapter command
- 看 `locator.resolvedSelector` / `locator.selectorCandidates`：用来判断低层步骤有没有稳定 selector 语义
- 看 `signal.*`：用来判断这一步是否真的带来了页面级变化，而不只是一次偶然的 DOM 动作

## command / flow / case 应该在什么时候沉淀

### 提升成 command

当这一步是稳定、原子、站点特定动作时：
- 搜索
- 打开详情
- 打开订单
- 进入发布页

一句话判断：如果人类能用一个动词短语描述它，它通常是 `command`。

当前正式沉淀路径：

```bash
fast-browser command save --site <site> --from-trace --id <commandId> --goal "<goal>"
fast-browser command materialize --draft <draft-path>
```

理解方式：
- 第一步先让 CLI 基于 `trace current` 生成 command draft
- 第二步如果需要更稳的落地参考，再让 CLI 输出 `manifest.json`、`commands/*.ts`、必要时 `index.ts` 的补丁建议
- 最后再由 Agent 把补丁建议真正落到 `src/adapters/<site>/...`

### 提升成 flow

当这是重复出现的多步目标时：
- 搜索并打开第一个结果
- 登录并进入后台
- 搜索商品并加入购物车

注意：
- `flow` 默认作用于当前 tab，当前正式允许保存：
  - `site`
  - `open`
  - `wait`
  - `waitForSelector`
  - `tabNew`
  - `tabSwitch`
  - `click`
  - `fill`
  - `press`
- `tabSwitch` 不应保存真实 tabId，只保存相对语义，例如 `previous`、`lastCreated`
- `click`、`fill`、`press` 只有在 target 能稳定化时才应进入正式 `flow`
- 不要把 `snapshot`、`eval`、裸 `@eN`、真实 tabId 直接写进已保存的 `flow`
- 如果某个低层步骤稳定、可命名、可参数化，应优先提升成 `command`，再让 `flow` 复用它；如果无法稳定化，就不要强行自动生成 flow

### 提升成 case

当目标是验证，而不是页面操作本身时：
- 验证搜索可用
- 验证登录后可进入后台
- 验证进入发布页后上传入口可见

当前 `case` 应该复用 `flow`，不要直接承载 DOM 级脚本。

## 当前 CLI 的硬约束

现在不只是 workflow 约定，CLI 本身也已经收了几条硬约束：
- `command save --from-trace` 的产物是 draft，不是正式 adapter 代码
- command draft 默认落在 `.fast-browser/sessions/<session>/drafts/commands/<site>/...`
- `command materialize --draft <draft-path>` 只输出补丁建议，不会自动修改 adapter 源码
- 正式 adapter 资产仍然必须落到 `src/adapters/<site>/...`
- `flow save` / `case save` 前，必须存在最近一次成功的 `trace current`
- 保存时会校验文件名与 `id`
- 保存时会校验 `flow` 引用、`command` 引用是否真实存在
- `flow save --from-trace` 只有在 tab 语义和交互 target 能稳定化时才会生成 draft；否则会明确拒绝，而不是生成错误 flow
- 如果 trace 里没有稳定起点（site 或 open），CLI 会拒绝生成依赖当前浏览器上下文的 flow，要求 Agent 从稳定入口重新跑一遍

如果 Agent 没先做 `trace current --json`，现在就不应该把 `command / flow / case` 当成已经成功沉淀。

## 多 Tab 与交互步骤（当前正式建议）

现在如果任务涉及多 tab，建议直接按正式写法：

```bash
fast-browser tab new --url "<url>"
fast-browser tab switch --id "<tabId>"
fast-browser tab close --id "<tabId>"
```

理解方式：
- `tab new --url` 负责创建并导航新 tab
- `tab switch --id` 用于切回已有 tab
- 之后的 `site`、`flow`、`case`、低层命令都默认绑定当前 tab

如果准备把这条路径沉淀成 `flow`：
- 只保留必要的 `tabNew` / `tabSwitch`
- 点击、输入、按键步骤只有在 target 稳定时才进入 `flow`
- 不能直接把 snapshot ref 或运行时 tabId 固化进去

## 登录态过期或需要人工登录时的标准流程

如果网站 cookie 过期、跳回登录页，或者本次任务本来就需要人工登录，正确流程不是让人类自己去猜该打开哪个窗口，而是：

1. Agent 固定一个稳定的 `--session-id`
2. Agent 用 `--headed` 打开目标网站的登录页或相关页面
3. Agent 明确告诉人类：
   - 现在请在刚打开的窗口里登录
   - 登录完成后回复“已登录”
4. 人类只负责在这个窗口里完成登录
5. 人类回复“已登录”后，Agent 继续执行：

```bash
fast-browser --session-id <id> auth sync
```

6. 然后 Agent 再从稳定的 post-login 页面继续跑业务 `flow / case`

一句话规则：
- 打开登录窗口是 Agent 的责任
- 人工只负责在窗口里完成登录
- 登录后的同步和后续验证仍然是 Agent 的责任

## 浏览器 Profile 架构原则（正式）

从人类操作视角，Fast-Browser 的正式架构原则是：

- `base profile`：长期保存，只承担认证母本。
- `session clone profile`：每个 Agent session 使用独立 clone profile 和独立浏览器实例。
- `tab`：只负责当前 session 内部的页面切换，不负责多 Agent 隔离。

这意味着：
- 多 Agent 并发时，不要期待它们共用同一个活跃 profile
- 要求 Agent 在整个任务中固定复用一个稳定的 `--session-id`
- clone profile 视为运行时缓存，不应被当作长期资产来维护

当前和后续的边界：
- 当前已实现 `session-clone` 与显式 `--session-id`
- 后续会继续补 `auth sync`、clone lifecycle 和 cleanup
- 即使 clone 被清理，后续目标也只是恢复登录态，而不是恢复旧 tab 与旧上下文

## PowerShell 下的 snapshot ref 用法

如果 Agent 运行在 PowerShell 里，不要裸写：

```bash
fast-browser click @e57
```

应该优先写成：

```bash
fast-browser click --target "@e57"
fast-browser fill --target "@e12" "hello"
```

原因是 PowerShell 会把裸的 `@e57` 当成特殊语法处理，CLI 可能根本收不到这个参数。

## 三个常见错误

### 错误 1：一上来就让 Agent 从 snapshot 开始

这样会让 Agent 每次都重新摸页面，越来越慢。

正确做法：先让它检查已有 `case / flow / command`。

### 错误 2：任务跑通后不沉淀

如果任务成功后不沉淀，下次还会重复探索。

正确做法：只要这个网站后面还会再用，就要让 Agent 在成功后至少读一次 `trace current`，再判断要不要沉淀 `command / flow / case`。

### 错误 3：把 case 写成另一套底层浏览器脚本

这样测试会非常脆。

正确做法：页面动作先沉淀成 `command` 和 `flow`，`case` 只负责验证语义。

## Fast-Browser adapter 与外部工具的边界

硬规则：
- 不要把外部站点专用 skill、CLI、MCP 的结果算成 Fast-Browser adapter 已完成
- 如果探索阶段借用了外部站点专用工具，这次结果只能标记为 `exploration-assisted`
- 最终验收必须回到 Fast-Browser 自己的 `site`、`flow`、`case` 或低层命令

只有满足下面这些条件，才算 Fast-Browser adapter 真正完成：
- 相关资产已经落到当前 workspace 的 `src/adapters/<site>`
- `fast-browser list` 或 `fast-browser info <site> --json` 能看到它
- 最终路径可以直接用 Fast-Browser 自己的 `site`、`flow` 或 `case` 跑通
