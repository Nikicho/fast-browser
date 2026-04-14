# Trace Current 到 Command 总结规范

这份文档面向使用 Fast-Browser 的 AI Agent。
目标不是让 Agent 把每一次成功操作都写成 adapter 代码，而是让 Agent 能从 `trace current` 的结构化日志里，识别出值得长期复用的原子站点能力，并把它们沉淀成 adapter `command`。

## 1. 适用范围

适用于这些场景：
- Agent 已经通过 Fast-Browser 命令完成了一次完整目标
- 执行过程中已经使用 `trace mark --type goal_start ...`
- 成功路径里存在稳定、单一、参数清晰的步骤
- 这一步值得被多个 `flow` 或后续任务复用

不适用于这些场景：
- 仍然只是一次性试错
- 这段路径本质上是复合目标，更适合沉淀成 `flow`
- 这段路径主要由脆弱 DOM 细节构成，暂时还看不出稳定语义

## 2. 核心判断

一句话：
- 原子、稳定、可参数化的步骤，优先变成 `command`
- 多步、目标导向、整段复用的路径，优先变成 `flow`

适合 `command` 的典型特征：
- 单一职责
- 输入参数清晰
- 输出结构明确
- 可以被多个目标复用
- 即使页面内部实现变化，也值得继续保留同一语义接口

例子：
- `search`
- `open-detail`
- `open-orders`
- `add-to-cart`
- `submit-login`

不适合直接做 `command` 的典型特征：
- 需要 3 到 5 步才能完成
- 本质上更像“完成某个目标”而不是“执行一个能力”
- 依赖大量上下文切换或页面状态机

这种更适合做 `flow`。

## 3. 标准工作流

推荐顺序：
1. `fast-browser trace mark --type goal_start --label "<goal>"`
2. 执行真实网站操作
3. 成功后执行 `fast-browser trace mark --type goal_success --label "<goal>"`
4. 执行 `fast-browser trace current`
5. 找出其中可抽象为原子能力的步骤
6. 先执行 `fast-browser command save --site <site> --from-trace --id <id> --goal "<goal>"` 生成 draft
7. 如需补丁建议，执行 `fast-browser command materialize --draft <draft-path>`
8. 再把 draft 和补丁建议落成真正的 adapter `command` 实现
9. 更新 adapter 的 `manifest.json`、`commands/*.ts`、必要时更新 `index.ts`
10. 用 `fast-browser test <adapter> [command]` 或真实 `site <adapter>/<command>` 验证
11. 如果已有 `flow` 可复用这个新 command，再回头收缩 flow

## 4. 如何从 Trace 里识别候选 Command

优先考虑这些类型的步骤：
- 搜索
- 打开详情页
- 提交表单
- 打开某个固定业务区域
- 读取某类稳定结构化数据

判断问题：
- 这一步是否可以独立命名？
- 这一步是否有清晰输入参数？
- 这一步的输出是否有稳定结构？
- 未来是否可能被多个 flow 重复使用？

如果这 4 个问题大多回答“是”，通常就适合做 `command`。

## 5. 不要直接照抄什么

不要直接把下面这些内容机械抄进 command：
- 失败点击
- 无效等待
- 调试性 `eval`
- 临时 `snapshot`
- 为了试错而做的来回跳转
- 只在某一次会话里偶然成立的 selector

`command` 的目标不是复刻一次日志，而是稳定封装网站能力。

## 6. Params 怎么选

Params 的目标是：
- 让 command 代表一类能力，而不是一次历史调用

选择原则：
- 会变化的输入，提升成 `args`
  例如：`query`、`slug`、`id`、`page`、`category`
- 明显只是内部实现细节的值，不要暴露成 `args`
- 如果某个值变化后，command 仍然代表同一种能力，它就应该是参数

坏例子：
- 暴露某个临时 selector 作为 command 参数
- 把调试开关、内部等待值默认暴露给上层调用者

## 7. 输出应该长什么样

`command` 的输出应该优先是结构化业务结果，而不是原始页面碎片。

推荐：
- 搜索命令返回 `items[]`
- 打开详情命令返回 `id`, `title`, `url`
- 打开订单命令返回 `orders[]`

不推荐：
- 直接把整页 HTML 原样暴露出去作为长期接口
- 长期依赖“文本长度”“页面是否大概有内容”这种弱语义输出

如果当前只能先返回弱语义结构，可以先作为过渡版本，但后续应继续收敛。

## 8. 命名规则

`command` 命名原则：
- 用能力语义命名，不用调试语义命名
- 尽量短，动词或动宾结构优先
- 避免带页面实现细节

好例子：
- `search`
- `open-detail`
- `open-orders`
- `submit-login`

坏例子：
- `click-first-card`
- `snapshot-then-open`
- `debug-search-fix`

## 9. 什么时候应该重构已有 Flow

如果一个 `flow` 里反复出现这些模式：
- `open -> wait -> click/fill` 的低层细节
- 多个目标都在重复同样的原子步骤
- 同一段页面操作被多个 case 依赖

说明这段步骤应该被提升成 `command`，然后让 `flow` 改为复用它。

一句话：
- `command` 负责吸收稳定原子能力
- `flow` 负责组合这些原子能力

## 10. 最小自检清单

在保存或实现 command 前，Agent 应自检：
- 这是不是单一职责
- 参数是否清晰
- 是否真的值得复用
- 是否删除了失败步骤和调试步骤
- 输出是否尽量结构化
- 命名是否是业务语义而不是 DOM 语义
- 是否会被多个 flow 或任务复用

## 11. 当前版本的现实约束

当前 Fast-Browser 里：
- `flow` 和 `case` 有显式 `save/run/list`
- `command` 已有 `command save --from-trace`，但当前产物是 draft，而不是可直接运行的 adapter 代码
- 因此 command 的沉淀现在是“CLI 先产出 draft，Agent 再补 adapter 实现”的两段式流程

这不是设计错误，而是当前版本刻意保持保守的产品边界。

所以当前推荐做法是：
- 先用 `command save --from-trace` 生成 command draft
  draft 现在会附带 `suggestedManifestCommand`、`suggestedSource` 和 `wiringNotes`，便于继续落成真实 adapter 代码
- 如需更稳的落地参考，可先执行 `command materialize --draft <draft-path>` 获取 `manifest.json`、`commands/*.ts`、`index.ts` 的补丁建议
- 再在现有 adapter 上补 `commands/*.ts`、`manifest.json`、必要时补 `index.ts`
- 如果需要更快起骨架，也可以结合 `guide scaffold`
- 最后用 `site <adapter>/<command>`、`test <adapter> [command]`、`flow run` 验证复用效果

## 12. 一个完整示例

目标：用户登录后搜索商品，并打开详情页。

如果成功路径里发现：
- “搜索商品”会反复出现
- 输入只有 `query`
- 输出可以稳定整理成 `items[]`

那么更合理的沉淀方式是：
- 把“搜索商品”做成 `command: search-product`
- 再把“搜索并打开第一条结果”做成 `flow: search-open-first-result`
- 最后把“登录后能搜索并进入详情页”做成 `case`

不要反过来把整个搜索过程都直接塞进一个巨大的 `command`。

## 13. 与 Flow 文档的关系

如果你已经确认某段路径不是原子能力，而是复合目标，请切换到：
- [TRACE_TO_FLOW_GUIDE.md](/D:/AIWorks/skills/fast-browser/docs/TRACE_TO_FLOW_GUIDE.md)

一句话：
- 原子能力看这份文档
- 复合目标看 `TRACE_TO_FLOW_GUIDE.md`
