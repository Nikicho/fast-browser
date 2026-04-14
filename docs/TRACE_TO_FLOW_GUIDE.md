# Trace Current 到 Flow 总结规范

这份文档面向使用 Fast-Browser 的 AI Agent。
目标不是让 Agent 重新发明一套步骤，而是让 Agent 基于 `trace current` 的结构化日志，把一次已经跑通的网站操作总结成可复用的 `flow.json`，再交给 `fast-browser flow save` 落盘。

## 1. 适用范围

适用于这些场景：
- Agent 已经通过 Fast-Browser 命令完成了一次完整目标
- 执行过程中已经用 `trace mark --type goal_start ...` 标记了目标开始
- 当前目标里有清晰的成功路径，可以沉淀为 `flow`

不适用于这些场景：
- 还在探索页面，还没形成稳定成功路径
- 目标本身只是一次性调试，不值得复用
- 这段操作本质上是断言型测试，更适合未来沉淀成 `case`

## 2. 标准工作流

推荐顺序：
1. `fast-browser trace mark --type goal_start --label "<goal>"`
2. 执行真实网站操作
3. 如果目标成功，执行 `fast-browser trace mark --type goal_success --label "<goal>"`
4. 如果目标失败，执行 `fast-browser trace mark --type goal_failed --label "<goal>"`
5. 用 `fast-browser trace current` 读取当前目标片段
6. 根据本规范总结成 `flow.json`
7. 用 `fast-browser flow save --site <site> --file <flow.json>` 保存

## 3. 总结目标

Agent 总结 `flow` 时，只做这件事：
- 把“成功且值得复用的步骤”提炼成稳定复合步骤

不要做这些事：
- 不要照抄整段原始日志
- 不要把试错、失败点击、无效等待直接写进 `flow`
- 不要把临时调试动作默认写进 `flow`
- 不要把 `snapshot`、`eval` 当成长期保留步骤，除非没有更稳定替代

## 4. 允许写进 Flow 的步骤

当前 Flow MVP 只允许两类步骤：
- `site`
  调用 `site <adapter>/<command>`
- `builtin`
  仅允许 `open`、`wait`、`waitForSelector`

因此总结时的优先级应该是：
1. 优先把操作归约成 `site <adapter>/<command>`
2. 必要时才保留 `open`
3. 必要时保留 `wait` 或 `waitForSelector`
4. 不直接把 `click`、`fill`、`snapshot`、`eval` 写进最终 `flow`

如果成功路径严重依赖 `click` 或 `fill`，先不要硬写进 `flow`。
应先判断：这段操作是不是应该先沉淀成新的 adapter `command`。

## 5. 如何从 Trace 提炼步骤

### 5.1 保留什么

优先保留：
- 目标入口页面
- 稳定等待条件
- 已有 adapter command
- 成功完成目标后仍然必要的成功断言

### 5.2 删除什么

默认删除：
- 失败步骤
- 重试前的错误步骤
- 纯观察性命令
  例如：`snapshot`、`console`、`network`
- 纯调试性命令
  例如：`eval`
- 与最终成功路径无关的来回跳转

### 5.3 何时保留等待

只有在这些情况下保留 `wait` / `waitForSelector`：
- 没有等待就无法稳定进入后续步骤
- 等待条件本身稳定且可重复
- 等待能表达业务语义
  例如：结果列表出现、登录表单出现、详情页主区域出现

## 6. 如何选择 Params

Params 的目标是让 `flow` 可复用，而不是只复现一次历史会话。

选择原则：
- 会变化的输入，应提升为 `params`
  例如：`query`、`page`、`slug`、`category`
- 固定入口 URL，不一定要做成 `params`
- 明显只是站点内部实现细节的值，不要暴露成 `params`

判断问题：
- 下次复用时，这个值大概率会变吗？
- 如果变了，flow 仍然代表同一类目标吗？
- 如果是，就应该做成 `params`

## 7. 如何写 Success

`success` 只写稳定、低成本、能说明目标达成的断言。

当前允许：
- `urlIncludes`
- `titleNotEmpty`
- `selectorVisible`

推荐：
- 至少保留 1 条成功断言
- 如果页面有明确主区域，优先用 `selectorVisible`
- 如果页面标题稳定，补一个 `titleNotEmpty`

不推荐：
- 使用容易变化的营销文案文本
- 使用过深、脆弱的 CSS selector

## 8. 命名规则

`id` 命名原则：
- 用目标语义命名，不用调试语义命名
- 用动词开头或目标短语
- 简洁，不要带临时上下文

好例子：
- `search`
- `search-open-first-detail`
- `open-orders`
- `checkout-basic`

坏例子：
- `test1`
- `debug-after-fix`
- `snapshot-then-click`

## 9. 判断是 Command 还是 Flow

如果一段操作：
- 单一职责
- 参数清晰
- 可稳定复用
- 更像网站原子能力

更适合沉淀成 `command`。

如果一段操作：
- 包含多个步骤
- 目标导向明显
- 未来会被反复整段复用

更适合沉淀成 `flow`。

一句话：
- 原子能力进 `command`
- 复合目标进 `flow`

## 10. 输出检查清单

在保存前，Agent 应自检：
- 是否只保留了成功主路径
- 是否删除了失败尝试和调试步骤
- 是否只使用允许的 `flow` 步骤类型
- 是否把可变输入提升成了 `params`
- 是否至少保留了一条稳定 `success`
- 是否命名成了业务语义，而不是调试语义

## 11. Flow 模板

参考模板：
- [trace-summary.flow.template.json](/D:/AIWorks/skills/fast-browser/docs/examples/trace-summary.flow.template.json)

参考示例：
- [trace-summary.flow.example.json](/D:/AIWorks/skills/fast-browser/docs/examples/trace-summary.flow.example.json)

## 12. 保存方式

总结完成后，保存命令是：

```bash
fast-browser flow save --site <site> --file <flow.json>
```

如果当前还不确定步骤是否足够稳定：
- 先不要保存
- 继续再跑 1 到 2 次相同目标
- 只有路径稳定后再沉淀成正式 `flow`
