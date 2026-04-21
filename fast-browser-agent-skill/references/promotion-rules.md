# 提升规则

Fast-Browser 只有在成功路径被提升成可复用资产后，才会越来越快。

## 保存时唯一证据

创建或更新 `command / flow / case` 之前，先执行：

```bash
fast-browser trace current --json
```

当 `trace current` 可用时，不要依赖：

- 聊天上下文
- 原始 `trace latest`
- 运行时口头总结

优先看：

- `locator.resolvedSelector`
- `locator.selectorCandidates`
- `signal.urlChanged`
- `signal.titleChanged`
- `flowSafe`
- `commandCandidate`

## 什么时候提升成 Command

当一步操作满足下面条件时，优先提升成 adapter `command`：

- 稳定
- 原子
- 站点特定
- 参数集很小且明确

典型例子：

- `search`
- `open-orders`
- `add-to-cart`

## 什么时候提升成 Flow

当目标满足下面条件时，优先提升成 `flow`：

- 多步
- 重复出现
- 作为一个命名目标有意义

额外规则：

- 如果某个 `site` 步骤返回 `success: false`，整个 flow 应立即视为失败
- 不要靠尾部断言去掩盖底层 command 已经失效的事实
- 保存下来的 flow 必须是可执行 DSL，不是浏览器探索日记

## 什么时候提升成 Case

当目标本质是验证时，提升成 `case`：

- smoke test
- regression check
- 人类手写验收场景的可执行化

额外规则：

- 当前版本的 `case` 应复用 `flow`
- 保存下来的 case 必须是可执行验证编排，不是步骤日记

## 永远不要保存

不要保存：

- 失败绕路
- 只出现过一次的不稳定 selector
- 只用于诊断的 `eval`
- 噪音重试和回退
- 依赖偶然 UI 状态才成功的步骤
- 当存在稳定直达路由时的装饰性首页点击
- 正式 `flow / case` 里的 `snapshot`
- 原始聊天记录、scratchpad、运行时总结
- 外部站点专用 skill / CLI 结果替代 Fast-Browser 执行
- 未经最终 Fast-Browser 重跑验证就声称“已完成”的资产

对低层步骤尤其注意：

- 如果只有 DOM 动作，没有页面级成功信号，应视为弱证据
- 如果只靠一次性的 `@eN` 成功，且没有稳定 selector 语义，不要直接提升
- 不要把同一条正式资产保存成 `-v2`、`-v3` 一类变体；正式目录里只保留一份最佳版本
- 如果一个“route”类 flow 只是通过固定 detail URL `open` / `tabNew` 到目标页，它不是合格的正式 flow
- 如果 flow 里出现连续重复步骤，先清洗再保存，不要把探索噪音写进正式资产
- 如果 case 只有 `titleNotEmpty`，它通常只是弱 smoke，不足以作为正式验证资产

## 好候选与坏候选

好候选通常具备：

- 清晰输入
- 清晰成功信号
- 不依赖单个脆弱 selector
- 多次运行可重复
- 站点允许稳定直达入口

坏候选通常表现为：

- 依赖隐藏前置状态
- 大量试错点击
- 只出现过一次的临时 DOM
- 内联 `eval` 才能工作
- 首页壳层点击比深链更脆
- flow 静默依赖“当前碰巧活动的 tab”

## 真正保存成功的条件

`flow` 或 `case` 只有在满足下面条件时才算真的保存成功：

- 文件位于活动 workspace
- 保存时校验通过
- `flow list` / `case list` 可以看到它
- 对应的 `run` 重新跑通
