# 从 Trace 提炼 Flow

使用 `fast-browser trace current --json` 判断一次成功路径里，哪些步骤应该沉淀成新的 `flow`。

## 正式输入

始终从清洗后的 `trace current` 出发，不要依赖原始 `trace latest`，也不要依赖聊天上下文回忆。

优先看：

- `entries[]`
- `discarded[]`
- `checkpoints[]`
- `entries[].locator`
- `entries[].signal`
- `entries[].flowSafe`
- `entries[].commandCandidate`

## 什么时候应该提炼成 Flow

当成功路径满足下面这些条件时，适合沉淀成 `flow`：

- 多步
- 后面还会重复执行
- 本身可以表达为一个有意义的目标

典型例子：

- 搜索并打开第一条结果
- 登录后进入订单页
- 搜索商品并加入购物车
- 先调用 `site`，再把前一步产出的 id / url 传给后一步

如果一段路径更像“原子站点能力”，应先提升成 `command`，再由 `flow` 复用它。

## 当前 Flow DSL 边界

当前允许直接进入正式 `flow` 的 builtin：

- `open`
- `wait`
- `waitForSelector`
- `tabNew`
- `tabSwitch`
- `click`
- `fill`
- `press`

当前不要直接进入正式 `flow` 的内容：

- `snapshot`
- `eval`
- `type`
- `hover`
- 裸 `@eN`
- 真实 `tabId`
- 失败分支、重试噪音、偶然绕路

额外约束：

- `tabSwitch` 只保存相对语义，例如 `previous`、`lastCreated`
- `click / fill / press` 只有在 target 能稳定表达时才进入正式 `flow`
- 如果一个交互步骤只有 DOM 动作，没有页面级成功信号，应优先考虑提升成稳定 `command`

## 清洗规则

在把 trace 变成 `flow` 之前：

- 去掉失败分支
- 去掉只是恢复噪音的重试
- 只保留最终成功路径
- 只保留完成目标所必需的步骤
- 能直接使用 `trace current.entries[]` 的结果时，不要手工重建路径

## 判断规则

- `flowSafe: true`：这个步骤可以直接考虑进入 `flow`
- `flowSafe: false`：不要把这个低层步骤直接写进正式 `flow`
- `commandCandidate: true`：如果步骤足够稳定，优先先提炼成 adapter `command`

如果 trace 里出现 `snapshot`，只把它当作探索证据，不要带入正式定义。

## 正式沉淀路径

从 trace 生成：

```bash
fast-browser flow save --site <site> --from-trace --id <flowId> --goal "<goal>"
```

从文件保存：

```bash
fast-browser flow save --site <site> --file <flow.json>
```

保存后必须验证：

```bash
fast-browser flow list <site>
fast-browser flow run <site>/<flow> --input '{...}'
```

一个 `flow` 只有满足下面条件才算真正保存成功：

- 文件位于活动 workspace 下
- `flow list` 可以看到它
- `flow run` 重新跑通

## 验收边界

如果探索过程中借助了外部站点专用工具，结果只能算 `exploration-assisted`。

只有当最终路径通过 Fast-Browser 自己的 `flow run` 或相关 CLI 路径重新跑通，才算真正完成 flow 沉淀。
