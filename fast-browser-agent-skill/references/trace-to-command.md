# 从 Trace 提炼 Command

使用 `fast-browser trace current --json` 判断一次成功路径里，哪些步骤应该沉淀成新的 adapter `command`。

## 正式输入

始终从清洗后的 `trace current` 出发，优先看：
- `entries[]`
- `entries[].locator`
- `entries[].signal`
- `entries[].commandCandidate`
- `discarded[]`

## 什么时候应该提炼成 Command

当成功路径里存在一个稳定、原子、可参数化的站点能力时，应优先提炼成 `command`。

典型例子：
- 搜索
- 打开详情
- 打开订单页
- 提交登录表单
- 打开设置页

如果一段路径更像“完成一个多步目标”，而不是“执行一个原子能力”，那通常更适合沉淀成 `flow`。

## 提炼规则

只保留稳定本质：
- 去掉失败点击和重试噪音
- 去掉一次性绕路
- 只保留真正需要暴露给上层的参数
- 保持站点语义，不暴露临时 DOM 细节
- 如果步骤暴露了 `locator.resolvedSelector` 和 `locator.selectorCandidates`，用它们判断稳定性
- 如果步骤带有 `signal` 字段，用它判断动作是否真的带来了页面级效果
- 不要把只依赖一次性 `snapshot` ref、没有可复用 selector 语义的步骤直接提升成 `command`

## 正式沉淀路径

当前 `command` 的沉淀是两段式：

```bash
fast-browser command save --site <site> --from-trace --id <commandId> --goal "<goal>"
fast-browser command materialize --draft <draft-path>
```

理解方式：
- `command save --from-trace` 先生成 command draft
- draft 默认落在 `.fast-browser/sessions/<session>/drafts/commands/<site>/...`
- `command materialize --draft` 再输出 `manifest.json`、`commands/*.ts`、必要时 `index.ts` 的补丁建议
- 正式 adapter 资产最终仍应落到 `src/adapters/<site>/...`

## 命名与边界

如果人类能用一个动词短语描述这一步，它通常是 command 候选。

好例子：
- `search`
- `open-detail`
- `open-orders`
- `submit-login`

坏例子：
- `click-first-card`
- `snapshot-then-open`
- `debug-search-fix`

## 验收边界

如果探索过程中借助了外部站点专用工具，结果只能算 `exploration-assisted`。
只有当最终路径通过 Fast-Browser 自己的 `site <adapter>/<command>` 或相关测试重新跑通，才算真正完成 command 沉淀。
