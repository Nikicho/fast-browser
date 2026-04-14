# 初始内置 Adapter 扩充设计

## 背景

当前 Fast-Browser 的内置初始 adapter 数量偏少，覆盖面不足，无法像 `bb-browser` 那样在开箱阶段就覆盖搜索、新闻、开发、视频、娱乐、知识等常见站点。  
这会导致两个问题：

- agent 首次进入常见网站时，过早退回到低层浏览器命令
- `command -> flow -> case` 的上层复用体系缺少足够的“初始原子能力”

本次扩充的目标不是机械复刻 `bb-browser` 的全部命令，而是参考它的站点覆盖和命令语义，优先补齐“稳定核心命令”，把这批站点做成 Fast-Browser 的**内置初始 adapter**。

## 目标

把以下站点做成内置初始 adapter，并注册到 [src/adapters/index.ts](/D:/AIWorks/skills/fast-browser/src/adapters/index.ts)：

- 搜索：`google`、`baidu`、`bing`、`wechat-search`
- 新闻：`36kr`、`toutiao`
- 开发：`github`、`stackoverflow`、`v2ex`、`npm`
- 视频：`bilibili`
- 娱乐：`douban`
- 知识：`wikipedia`、`zhihu`、`open-library`

设计目标：

- 站点范围对齐 `bb-browser` 当前核心站点子集
- 命令语义尽量参考 `bb-browser`
- 只收“稳定核心命令”，不追高风险网页内部注入能力
- 所有初始 adapter 统一放到 [src/adapters](/D:/AIWorks/skills/fast-browser/src/adapters)

## 非目标

本次不做这些事情：

- 不追求 1:1 复刻 `bb-browser` 的全部命令数量
- 不引入依赖重度登录态、页面内部私有模块注入、webpack/pinia 反射的高风险命令
- 不为每个站点同步生成完整 `flow/case`
- 不做新的自动学习闭环

## 总体策略

### 1. 站点范围对齐，命令层做“稳定核心对齐”

每个站点先实现最核心、最稳定、最适合被 agent 直接复用的命令：

- `search`
- `hot`
- `rank`
- `page`
- `question`
- `topic`
- `repo`
- `package`
- `subject`
- `video`

不把“只有在真实浏览器中挂住复杂登录态并注入页面脚本才稳”的命令作为第一轮内置命令。

### 2. 优先使用公开接口或稳定 HTML

实现优先级：

1. 稳定公开 JSON/API
2. 稳定 HTML 页面抓取
3. 必要时少量页面结构解析

明确避免：

- 依赖网站内部私有 JS module 的注入
- 依赖前端运行时 store 的读取
- 依赖当前已打开标签页上下文才能稳定工作的“半探索式命令”

### 3. 内置 adapter 只提供原子能力

初始 adapter 的职责是提供可组合的 `command`。  
后续复杂操作仍由：

- `flow`
- `case`
- 用户与 agent 在实操中沉淀出的站点资产

来完成。

## 命令设计

### 搜索类

- `google/search`
- `baidu/search`
- `bing/search`
- `wechat-search/search`

通用输出倾向：

- `query`
- `page`
- `items[]`
- 单项包含 `title`、`url`、`snippet`、`source/domain`

### 新闻类

- `36kr/news`
- `toutiao/hot`

通用输出倾向：

- `items[]`
- 单项包含 `title`、`url`、`summary?`、`publishedAt?`

### 开发类

- `github/search`
- `github/repo`
- `stackoverflow/search`
- `stackoverflow/question`
- `v2ex/hot`
- `v2ex/topic`
- `npm/search`
- `npm/package`

### 视频类

- `bilibili/search`
- `bilibili/rank`
- `bilibili/video`

### 娱乐类

- `douban/search`
- `douban/top250`
- `douban/subject`

### 知识类

- `wikipedia/page`
- `zhihu/hot`
- `zhihu/question`
- `zhihu/search`
- `open-library/search`
- `open-library/book`

## 分批实现顺序

为了兼顾风险和价值，按下面顺序做：

### 第一批

- `baidu`
- `bing`
- `stackoverflow`
- `npm`
- `open-library`
- 正式接入并收稳现有 `bilibili`

原因：

- 页面结构相对清晰
- 输出结构标准化更容易
- 适合验证 adapter 模板和 manifest 规范

### 第二批

- `google`
- `36kr`
- `toutiao`
- `v2ex`
- `douban`

原因：

- 价值高，但页面和结构化抽取复杂度略高

### 第三批

- `zhihu`
- `wechat-search`

原因：

- 登录态、结构变化和内容限制相对更多
- 更适合在前两批模板稳定后再做

### 现有 adapter 处理

- 保留并继续使用：`github`、`wikipedia`、`javdb`
- `bilibili` 从“目录存在但未注册”提升为正式内置 adapter

## 目录与注册规则

所有初始 adapter 统一放在：

- [src/adapters](/D:/AIWorks/skills/fast-browser/src/adapters)

每个站点目录的基本结构：

```text
src/adapters/<site>/
  manifest.json
  index.ts
```

必要时再拆：

```text
src/adapters/<site>/commands/*.ts
```

所有新站点都必须注册进：

- [src/adapters/index.ts](/D:/AIWorks/skills/fast-browser/src/adapters/index.ts)

## 数据结构原则

初始 adapter 的返回结构要尽量统一，至少遵守这些约束：

- 列表类命令返回 `items[]`
- 详情类命令返回清晰字段，不把整页 HTML 或原始 DOM 结构直接暴露给上层
- 字段命名尽量语义化
- 不把调试型字段混入正式输出

## 测试策略

每新增一个初始 adapter，至少补：

1. adapter 级 smoke test
   - 命令存在
   - manifest 与执行器对齐

2. 解析层单元测试
   - 输入页面/JSON 样本
   - 输出结构符合预期

3. 必要的集成测试
   - 重点覆盖 `site <adapter>/<command>`

本次不要求每个站点都配完整 live e2e，但要保证：

- manifest 正确
- 命令能被注册发现
- 返回结构可预测

## 风险与约束

### 1. 站点变更风险

依赖 HTML 结构的 adapter 容易因为页面改版失效。  
对此的应对是：

- 优先公开接口
- 解析逻辑保持小而集中
- 为常见列表/详情结构补测试样本

### 2. 命令规模膨胀

如果盲目追平 `bb-browser`，命令数会迅速膨胀，且很多命令不稳定。  
本次通过“稳定核心对齐”来控制范围。

### 3. 站点差异过大

不同站点页面形态差异很大，容易过早抽象。  
本次策略是不先做抽象框架，而是优先建立一批质量稳定的具体 adapter，再从实现中归纳公共模式。

## 验收标准

完成后应满足：

- 指定范围内的站点都存在对应内置 adapter 目录
- 都已注册进 [src/adapters/index.ts](/D:/AIWorks/skills/fast-browser/src/adapters/index.ts)
- 每个站点至少有 1 到 3 个稳定核心命令
- `list` 能看到这些站点
- `site <adapter>/<command>` 能返回结构化结果
- 测试通过

## 下一步

按这个设计，下一步进入实现计划阶段，输出分批任务、文件清单、测试清单和实施顺序。
