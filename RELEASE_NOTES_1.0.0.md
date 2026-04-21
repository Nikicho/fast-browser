# Fast-Browser 1.0.0

Fast-Browser `1.0.0` 是第一个正式发布版本。

这个版本的目标不是继续扩能力面，而是把核心链路收口到可正式对外承诺的状态：让 Agent 更快访问真实网站，并把同一套能力挂载到前端功能测试与回归验证。

## Highlights

- 完成 `site / flow / case` 的主入口收口，明确低层浏览器命令主要用于探索、补位和失败诊断。
- `flow run` 与 `case run` 在失败时返回结构化落点，能够明确失败发生在哪个 `flow`、哪个步骤或哪条断言。
- 运行时补齐自动诊断链路，失败结果可统一引用 `console / network / snapshot / screenshot / trace` 诊断信息。
- `eval` 改为显式参数入口，并新增 `run-script`，降低 PowerShell 下复杂多步操作的参数拆分问题。
- 增强交互语义：补齐 `fill` 事件触发、`press` 对 ref 目标的支持、`open` 之后的 URL 等待能力。
- 强化 `snapshot -i` 的结构化定位信息，降低 Agent 和 Adapter 在真实网站上的元素定位成本。
- 补齐 Adapter DX：注册失败、导出约定、`sessionPolicy` 校验、`context.runtime` 文档与默认导航约定。

## Public Support Boundary

- 正式主入口：`site`、`flow`、`case`
- 低层命令：`open / snapshot / click / fill / press / type / wait / waitForSelector / tab / console / network / screenshot / trace`
- 失败诊断能力默认自动采集，但仍保留手动命令入口用于继续定位
- Node 公开支持环境：`20+`

## Verification

- `npm run typecheck`
- `npm test`
- `npm audit --omit=dev --json`
- `npm pack`

验证结果：

- `42` 个测试文件通过
- `276` 个测试通过
- 生产依赖漏洞：`0`
- 发布包产物：[fast-browser-1.0.0.tgz](D:/AIWorks/skills/fast-browser/fast-browser-1.0.0.tgz)
