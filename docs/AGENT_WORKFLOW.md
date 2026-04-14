# Agent Workflow

这份文档面向使用 Fast-Browser 的 AI Agent。
目标是把 `guide`、`command`、`flow`、`case`、`trace` 串成一套稳定工作流，让 Agent 在网站上第一次完成任务后，能够持续沉淀经验，减少后续对 `snapshot` 和 `eval` 的依赖。

## 1. 这套设计要解决什么问题

Fast-Browser 的初始目标不是“替代浏览器自动化脚本”，而是：
- 让 Agent 能通过统一命令操作网页
- 让 Agent 能在真实使用过程中总结常用步骤
- 让这些步骤被重复复用，后续执行更快、更稳

因此真正的目标不是把所有网页操作都写成低层命令，而是逐步把：
- 一次性试错
- 低层 DOM 操作
- 临时 `snapshot` / `eval`

沉淀成：
- 稳定原子能力：`command`
- 高频复合步骤：`flow`
- 验证场景：`case`

## 2. 对最初目标的判断

结论：当前设计方向正确，已经具备可用骨架，但还不是全自动闭环。

已经满足的部分：
- 有低层命令可把任务先跑通
- 有 `guide` 可为新站点快速起 adapter 和 starter flow
- 有 `flow` 可保存复合步骤，减少重复探索
- 有 `case` 可把多个 flow 组合成测试场景
- 有 `trace` 可记录目标过程，为后续总结提供依据

还没有完全自动化的部分：
- CLI 还不会自动把脏日志提炼成高质量 `flow`
- Agent 仍需要自己判断哪些步骤值得沉淀
- `command` 虽然已有 `save --from-trace` 入口，但当前只生成 draft，不会自动补完 adapter 实现

所以当前系统已经能支撑“越用越快”，但“经验沉淀”仍主要靠 Agent，而不是 CLI 自动完成。

## 3. 五类能力的边界

### 3.1 `guide`

`guide` 负责新站点冷启动。

适合做：
- 探测页面类型
- 推断常见参数
- 生成 adapter command 骨架
- 生成 starter flow

不适合做：
- 从长轨迹里自动学习稳定经验
- 自动判断哪些试错步骤应该被保留
- 自动产出高可信 `case`

一句话：
- `guide` 是脚手架，不是学习系统

### 3.2 `command`

`command` 是原子站点能力。

适合沉淀成 `command` 的步骤：
- 单一职责
- 参数清晰
- 可稳定复用
- 更像网站语义能力，而不是临时 DOM 操作

例子：
- `search`
- `open-detail`
- `add-to-cart`
- `open-orders`

一句话：
- `command` 是速度和稳定性的第一层

### 3.3 `flow`

`flow` 是多个 `command` 的复合步骤。

适合沉淀成 `flow` 的目标：
- 需要多个步骤配合
- 目标明确
- 未来会被整段重复使用

例子：
- `search-open-first-detail`
- `login-open-orders`
- `search-add-first-item-to-cart`

一句话：
- `flow` 是最贴近“让 Agent 越用越快”这个目标的核心资产

### 3.4 `case`

`case` 是测试场景与断言层。

适合做：
- 手工用例执行
- smoke test
- 回归测试
- 多个 flow 的业务验证

不适合做：
- 承担大量页面细节操作
- 直接替代 `flow`

一句话：
- `case` 是验收层，不是提速主层

### 3.5 `trace`

`trace` 是经验沉淀的记录层。

作用：
- 记录 Agent 实际执行过的命令
- 标记一个目标的开始和结束
- 让 Agent 从成功路径里总结 `flow`

一句话：
- `trace` 不负责学习，它负责留下可供学习的证据

## 4. Agent 的标准工作流

### 阶段 A：新站点冷启动

推荐顺序：
1. 用 `guide inspect/plan/scaffold` 起 adapter 和 starter flow
2. 先获得可运行的站点骨架，而不是一次做到完美
3. 如果站点需要登录，用 `open --headed` 打开真实页面，完成登录

这一阶段的目标是：
- 先有可用站点骨架
- 先有最小 `command`
- 先有 starter `flow`

### 阶段 B：第一次完成真实目标

推荐顺序：
1. `trace mark --type goal_start --label "<goal>"`
2. 优先尝试已有 `site <adapter>/<command>`
3. 不够时再退回低层命令：`open`、`snapshot`、`click`、`fill`、`wait`、`eval`
4. 跑通完整目标
5. 成功后执行 `trace mark --type goal_success --label "<goal>"`
6. 失败则执行 `trace mark --type goal_failed --label "<goal>"`

这一阶段的目标不是“立刻写出最佳 flow”，而是：
- 先确认这个目标真实可达成
- 先确认页面路径、等待条件、关键步骤

### 阶段 C：从成功路径里沉淀 `command` 与 `flow`

推荐顺序：
1. 执行 `fast-browser trace current --json`
2. 读取当前目标片段
3. 删除失败步骤、调试步骤、纯观察步骤
4. 只保留成功主路径
5. 对稳定原子能力先执行 `fast-browser command save --site <site> --from-trace --id <id> --goal "<goal>"`
6. 如需落地补丁建议，再执行 `fast-browser command materialize --draft <draft-path>`
7. 把剩余的复合目标整理成 `flow.json`
8. 执行 `fast-browser flow save --site <site> --file <flow.json>`

判断原则：
- 如果某一步是稳定原子能力，应优先变成 `command`
- command draft 只是中间沉淀物，正式 adapter 资产仍需落到 `src/adapters/<site>/...`
- 如果某个目标由多个稳定步骤组成，应沉淀成 `flow`

### 阶段 D：进入复用模式

一旦某个站点已有稳定 `command` 和 `flow`，后续执行顺序应调整为：
1. 优先 `site <adapter>/<command>`
2. 其次 `flow run <site>/<flow>`
3. 只有缺失能力时才回退到低层命令
4. 如果又发现新的高频路径，再继续补 `command` 或 `flow`

这时 Fast-Browser 的使用重点会从“探索网页”变成“调用已沉淀能力”。

### 阶段 E：把验收沉淀成 `case`

当一个目标已经有稳定 `flow` 后，再考虑做 `case`。

推荐顺序：
1. 先确认已有 flow 足够稳定
2. 把多个 flow 组合成一个业务验证场景
3. 加入必要断言
4. 保存成 `case.json`
5. 用 `case run` 跑自动化验证

## 5. 一次任务结束后，Agent 应如何复盘

每次完成一个网站任务后，Agent 应做这 4 个判断：

1. 这次完成目标是否依赖了大量 `snapshot` / `eval`？
如果是，说明还缺少可复用能力。

2. 其中有没有稳定、单一、可参数化的步骤？
如果有，应该提升成 `command`。

3. 有没有会被反复整段执行的多步目标？
如果有，应该沉淀成 `flow`。

4. 这是不是一个值得长期回归验证的业务场景？
如果是，再把多个 flow 组合成 `case`。

## 6. `command` / `flow` / `case` 的判断规则

### 适合做 `command`
- 单步能力
- 参数清晰
- 低层页面细节可以封装在 adapter 内部
- 多个 flow 都可能复用它

### 适合做 `flow`
- 多步组合
- 目标明确
- 会反复整段执行
- 不值得每次从低层命令重走

### 适合做 `case`
- 有明确业务验证目标
- 已经存在可复用 flow
- 需要断言结果，而不是只完成动作

## 7. 推荐的优先级

对于真实网站操作，推荐优先级是：
1. 优先补 `command`
2. 再沉淀 `flow`
3. 最后再补 `case`

原因：
- 没有稳定 `command`，`flow` 容易变脆
- 没有稳定 `flow`，`case` 会直接绑死在页面细节上

## 8. 一个完整示例

目标：验证“登录后搜索商品并打开第一个详情页”。

推荐过程：
1. `open --headed` 打开站点并登录
2. 用已有能力或低层命令完成一次完整搜索
3. 用 `trace current` 读取成功路径
4. 发现“搜索商品”是稳定原子能力，沉淀成 `command: search-product`
5. 发现“搜索并打开第一条结果”是高频复合目标，沉淀成 `flow: search-open-first-result`
6. 发现“登录后能搜索并进入详情页”是验收目标，沉淀成 `case: search-detail-smoke`

最后形成的资产是：
- `command`: `search-product`
- `flow`: `search-open-first-result`
- `case`: `search-detail-smoke`

## 9. 当前版本最值得遵守的原则

- 不要让 `guide` 承担学习系统的职责
- 不要把试错步骤直接沉淀进 `flow`
- 不要让 `case` 承担大量页面操作细节
- 不要长期依赖 `snapshot` 和 `eval` 作为主路径
- 优先把高频、稳定、可参数化的步骤沉淀成站点能力

## 10. 当前设计的核心结论

Fast-Browser 当前最重要的主线不是：
- 用 `guide` 自动生成一切

而是：
- 用低层命令先把目标跑通
- 用 `trace` 记录过程
- 由 Agent 总结成功路径
- 把高价值能力沉淀为 `command` 和 `flow`
- 再用 `case` 做验收和回归

一句话总结：
- `guide` 负责起步
- `command` 负责原子能力
- `flow` 负责速度提升
- `case` 负责验证
- `trace` 负责给沉淀提供证据
