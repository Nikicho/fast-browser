# Fast-Browser 人类操作手册

这份手册写给“通过 agent + Fast-Browser 操作网站”的人类使用者。

它不是命令字典。它回答的是：

- 你应该怎样给 agent 下指令
- 什么场景该复用已有能力，什么场景该新建能力
- 登录、trace、沉淀这些动作，谁来做，先后顺序是什么

如果你想看每个命令的完整语法，请直接看 [CLI 完整命令手册](./cli-reference.md)。

## 先记住 3 条

1. 先复用，不要一上来探索页面
2. 需要登录时，agent 负责打开窗口，你负责在那个窗口里完成登录
3. 任务跑通后，要不要沉淀，先看 `trace current --json`

Fast-Browser 的固定优先级是：

1. `case run`
2. `flow run`
3. `site <adapter>/<command>`
4. 低层浏览器命令

这意味着：不要一开始就让 agent `snapshot`、猜 selector、写临时脚本。

## 一个标准开场

如果你不确定怎么开口，直接这样说通常就够了：

```text
先做 fast-browser preflight，确认 workspace、browser 状态和已有能力。优先复用 case、flow、site command；只有高层能力不够时才回退到低层浏览器命令。
```

一个合格的 preflight 通常至少包含：

```bash
fast-browser health
fast-browser workspace --json
fast-browser browser status --json
fast-browser session cleanup --max-age-hours 24
fast-browser list
```

你不需要记住这些命令本身。对人类来说，重点只是：先让 agent 做预检，再决定是复用现有能力，还是进入探索。

## 场景一：网站已经有适配能力

如果这个网站以前做过，不要让 agent 从头摸页面。

你可以这样说：

```text
先查现有的 site、flow、case。优先直接复用，不要先从 snapshot 开始。
```

理想的行为应该是：

- 先 `fast-browser list`
- 再 `fast-browser info <site> --json`
- 必要时 `fast-browser info <site>/<command> --json`
- 能直接 `case run` 就不要重写验证
- 能直接 `flow run` 就不要重复拼步骤
- 能直接 `site <adapter>/<command>` 就不要回到低层命令

## 场景二：这是新网站，或者还没有可复用能力

这时也不要直接让 agent 把首页点来点去固化下来。

更好的说法是：

```text
这是新站点。先找稳定直达入口，再用 guide 起 adapter 骨架。真实任务跑通后，再基于 trace current 收敛成 command、flow、case。
```

你期待 agent 做的是：

```bash
fast-browser guide inspect --url <url>
fast-browser guide plan --platform <name> --url <url> --capability "<capability>"
fast-browser guide scaffold --platform <name> --url <url> --capability "<capability>"
```

然后让它确认生成物是否真的落在：

```text
src/adapters/<site>/...
```

`guide` 的定位是起骨架，不是一次性自动生成成熟 adapter。

## 登录应该怎么协作

登录是最容易混乱的环节。正确分工是：

- agent 负责打开正确的窗口
- 人类负责在这个窗口里完成登录
- 登录后的状态同步和后续流程，仍然由 agent 负责

建议你直接这样说：

```text
请用 headed 模式打开登录页，我会在你打开的窗口里完成登录。登录完成后你继续处理后续步骤，不需要我处理额外的技术细节。
```

标准流程是：

1. agent 固定一个稳定的 `--session-id`
2. agent 用 `--headed` 打开登录页或相关入口
3. 你在那个窗口里完成登录
4. 你回复“已登录”
5. agent 自行处理登录后的状态同步
6. agent 再继续跑 `site / flow / case`

不要自己猜该在哪个浏览器窗口里登录，也不要让 agent 只丢一句“请登录”。登录后的状态同步与继续执行，应由 agent 自己负责。

## 什么时候该要求 agent 打 trace

判断标准很简单：

- 这次只是临时一次性动作，不准备复用，可以不强调 trace
- 这次如果跑通，后面大概率还会再做，就应该从一开始打 trace 边界

推荐说法：

```text
这次任务后面还会复用。请从 goal_start 开始记 trace，关键节点打 checkpoint，成功后打 goal_success，并基于 trace current 总结可沉淀能力。
```

对应的命令通常是：

```bash
fast-browser trace mark --type goal_start --label "<goal>"
fast-browser trace mark --type checkpoint --label "<checkpoint>"
fast-browser trace mark --type goal_success --label "<goal>"
```

## 为什么现在强调 `trace current --json`

因为正式沉淀前，不应该再主要依赖聊天上下文去“回忆流程”。

现在应该让 agent 先读取：

```bash
fast-browser trace current --json
```

然后再决定：

- 哪些步骤适合提升成 `command`
- 哪些步骤适合组合成 `flow`
- 哪个验证目标应该写成 `case`

你可以把它理解成：`trace latest` 更像原始事件日志，而 `trace current` 更像当前这次成功路径的整理视图。

## command、flow、case 分别在什么时候沉淀

### 适合沉淀成 `command`

当它是一个稳定、原子、站点特定的动作，例如：

- 搜索
- 打开详情
- 进入某个固定后台入口
- 打开发布页

一句话判断：如果人类能用一个动词短语稳定描述它，它通常适合做成 `command`。

### 适合沉淀成 `flow`

当目标由多步稳定动作组成，而且以后还会重复出现，例如：

- 搜索并打开第一条结果
- 登录后进入后台并切到某个页面
- 进入商品页并完成一段固定填写流程

### 适合沉淀成 `case`

当你要验证的是“结果成立”，而不是“页面怎么点”。

例如：

- 验证搜索功能可用
- 验证登录后能进入后台
- 验证进入某个页面后上传入口可见

`case` 应建立在 `flow` 之上，而不是再单独写一遍低层浏览器步骤。

## 沉淀时应该期待 agent 走什么路径

命令草稿：

```bash
fast-browser command save --site <site> --from-trace --id <commandId> --goal "<goal>"
fast-browser command materialize --draft <draft-path>
```

流程：

```bash
fast-browser flow save --site <site> --from-trace --id <flowId> --goal "<goal>"
fast-browser flow run <site>/<flow> --input '{...}'
```

验证：

```bash
fast-browser case save --site <site> --id <caseId> --goal "<goal>" --flow <flowId>
fast-browser case run <site>/<case> --input '{...}'
```

你需要知道的边界：

- `command save --from-trace` 先生成的是 draft
- `command materialize --draft` 给的是正式落地建议，不会自动改源代码
- 正式 adapter 资产应落在 `src/adapters/<site>/...`
- `.fast-browser/sessions/...` 下的运行时草稿不是正式交付物

## 多 session / 多 tab 的最小认知

如果任务涉及多 agent 或多个独立会话，应让 agent 固定使用一个稳定的 `--session-id`。`r`n`r`n这不是说你要亲自去拼这些参数，而是当任务明显跨阶段、跨窗口或跨 agent 时，要提醒 agent 明确说明它是否准备启用这一策略。

如果任务涉及多 tab，建议让 agent 使用正式命令，而不是隐式猜测：

```bash
fast-browser tab list --json
fast-browser tab new --url "<url>"
fast-browser tab switch --id "<tabId>"
fast-browser tab close --id "<tabId>"
```

不要默认：

- `open` 一定会新开 tab
- `site` 或 `flow` 会自动跳回旧 tab

## 3 个最常见的误区

### 误区一：一上来就让 agent `snapshot`

这样会让每次任务都从页面考古开始，复用能力就永远长不起来。

正确做法：先检查现有 `case / flow / site command`。

### 误区二：任务跑通后不沉淀

这样下次还会重复探索。

正确做法：只要这个网站后面还会再用，就让 agent 至少读取一次 `trace current --json`，再判断是否沉淀。

### 误区三：把 `case` 写成另一套浏览器脚本

这样验证会非常脆。

正确做法：页面动作先沉淀成 `command / flow`，`case` 只负责验证语义。

## 常见安装与运行问题

### `File is not defined` 或 `undici` 相关报错

优先检查 Node 版本。当前公开支持环境是 `Node 20+`。

### 镜像站安装结果不对

优先排查镜像缓存滞后。必要时切回官方 npm 源重新安装。

### PowerShell 下 `@e57` 不生效

改用：

```bash
fast-browser click --target "@e57"
```

不要裸写 `@e57`。

## 对外承诺支持

当前公开承诺支持的命令与参数，以这两处为准：

- `fast-browser --help`
- [CLI 完整命令手册](./cli-reference.md)

内部规划文档、试验文档和 `docs-internal/` 内容不属于公共 API 承诺范围。


