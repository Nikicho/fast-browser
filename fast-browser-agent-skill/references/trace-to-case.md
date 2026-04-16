# 从 Trace 与 Flow 提炼 Case

`case` 的目标不是保存一套新的浏览器步骤，而是把验证目标建立在已有 `flow` 之上。

## 什么时候应该提炼成 Case

当目标本质是验证时，适合沉淀成 `case`：

- smoke test
- regression check
- 人类手写验收场景的可执行化

典型例子：

- 验证登录后能进入后台
- 验证搜索页能正常打开并看到结果
- 验证发布页入口可见

如果你保存的是“如何点页面”，那通常还不是 `case`，而是 `flow` 或 `command`。

## 输入边界

优先顺序是：

1. 先有稳定的 `flow`
2. 再围绕这个 `flow` 添加验证断言

不要直接把原始 trace、低层命令历史或聊天记录当作 `case` 定义。

## 当前 Case 断言能力

当前 `case` 支持围绕 `flow` 表达这些断言：

- `urlIncludes`
- `titleNotEmpty`
- `selectorVisible`
- `textIncludes`
- `textNotIncludes`
- `selectorCountAtLeast`
- `selectorCountEquals`
- `elementTextIncludes`
- `elementTextEquals`
- `storageValueEquals`
- `networkRequestSeen`

如果一个验证目标可以靠这些断言表达，就应该优先沉淀成 `case`。

## 正式沉淀路径

基于已有 `flow` 生成：

```bash
fast-browser case save --site <site> --id <caseId> --goal "<goal>" --flow <flowId>
```

常见增强：

```bash
fast-browser case save --site <site> --id <caseId> --goal "<goal>" --flow <flowId> --url-includes "/path" --text-includes "success" --title-not-empty
```

也可以从文件保存：

```bash
fast-browser case save --site <site> --file <case.json>
```

## 保存规则

- `case` 应复用真实存在的 `flow`
- 不要把低层 DOM 步骤再写一遍
- 不要把失败探索、临时调试和一次性绕路写进 `case`
- 不要把 `.fast-browser/sessions/...` 下的运行时草稿当正式资产

## 保存后验证

```bash
fast-browser case list <site>
fast-browser case run <site>/<case> --input '{...}'
```

一个 `case` 只有在下面条件满足时才算真正保存成功：

- 文件位于活动 workspace 下
- `case list` 可以看到它
- `case run` 重新跑通

## 一个简单判断

如果你想表达的是：

- “怎么走到那里” -> `flow`
- “到了之后应该满足什么” -> `case`
