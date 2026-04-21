# Fast-Browser Adapter 开发指南

这份文档写给 adapter 作者和需要读 `context.runtime` 的 Agent。

## 1. Adapter 加载约定

Fast-Browser 会从 `src/adapters/<site>/` 或自定义 adapters 目录加载 adapter。

一个可加载 adapter 至少包含：

- `manifest.json`
- `index.ts` 或 `index.js`

### manifest.sessionPolicy

正式推荐值只有 3 个：

- `none`
- `optional`
- `required`

兼容说明：

- 旧值 `login-required` 现在会被兼容并自动归一化为 `required`
- 新增或维护 adapter 时，仍然应直接写 `required`

### 支持的导出形态

当前支持以下导出方式：

```js
module.exports = adapter;
```

```js
module.exports = { adapter };
```

```ts
export default adapter;
```

```ts
export const adapter = adapterImpl;
```

如果导出不符合约定，CLI 启动时会输出 adapter 加载诊断，不再静默失败。

## 2. 默认导航机制

Fast-Browser 的默认导航机制不是额外一套 DSL，而是：

- `site <adapter>/<command>` 本身就是站点级快速导航入口
- 能直接进入某个页面、模块、功能区的 command，应优先建成正式 `site command`
- Agent 在尝试 `open <url>` 之前，应先检查是否已有可复用导航入口

推荐顺序：

```bash
fast-browser list
fast-browser info <site> --json
fast-browser info <site>/<command> --json
```

设计原则：

- 如果某个入口是“稳定、常用、站点特定”的，优先做成 command
- `flow` 主要复用 command；只有 command 暂时覆盖不了时，才补 `click / fill / press / tab`
- 不要把“先 open 再 snapshot 再猜 selector”当成默认导航机制

## 3. context.runtime 能力面

`context.runtime` 是 adapter 唯一应该依赖的浏览器运行时入口。

### 页面与导航

- `open(url, options?)`
  用真实浏览器打开页面。
- `getUrl()`
  读取当前 URL。
- `getTitle()`
  读取当前标题。
- `wait(options)`
  等待时间、文本、URL 子串或函数条件。
- `waitUntilUrlContains(urlPart, options?)`
  显式等待 URL 包含某段子串，适合登录跳转、搜索页跳转、后台路由切换。
- `waitForSelector(selector, options?)`
  等待元素出现或进入指定状态。

### 交互

- `click(target, options?)`
  默认先等待元素可见，再点击。
- `type(target, text, options?)`
  模拟逐字键盘输入。
- `fill(target, text, options?)`
  通过 DOM setter 写值，并触发 `input` 与 `change` 事件。
- `press(key, options?)`
  支持 `selector` 和 `@eN` ref 目标。
- `hover(target, options?)`
- `scroll(targetOrDirection, amount?)`

### 快照与定位

- `snapshot(options?)`
  返回页面文本和交互元素列表。

`snapshot -i` / `runtime.snapshot({ interactiveOnly: true })` 里的交互元素现在包含：

- `ref`
- `tag`
- `text`
- `selector`
- `selectors`
- `placeholder`
- `role`
- `ariaLabel`
- `href`
- `name`
- `inputType`

推荐做法：

- 优先使用 `selectors` 中更稳定的语义选择器
- 只有没有稳定选择器时，才回退到结构选择器
- adapter 内不要固化一次性 `@eN`

## 4. 何时用 open，何时用 waitUntilUrlContains

推荐原则：

- 只是进入页面：先 `open(url)`
- 页面打开后还会继续跳转：补 `waitUntilUrlContains(...)`
- 站点内部路由切换明显依赖前端框架：优先 `waitUntilUrlContains(...)` 或 `waitForSelector(...)`

示例：

```ts
await context.runtime.open(searchUrl);
await context.runtime.waitUntilUrlContains("/search");
await context.runtime.waitForSelector(".search-result", { timeoutMs: 8000 });
```

## 5. run-script 与 eval 的边界

### `eval`

适合：

- 一次性读取页面状态
- 小型表达式
- 调试时快速确认条件

不适合：

- 多步浏览器流程
- 依赖 PowerShell 复杂引号转义的长表达式

CLI 现在支持：

- `fast-browser eval "<expression>"`
- `fast-browser eval --expr "<expression>"`
- `fast-browser eval --file ./expr.js`

### `run-script`

适合：

- 一次性多步浏览器操作
- 不值得沉淀为正式 `flow`，但也不想手打一串 CLI

当前脚本格式为 JSON：

```json
{
  "continueOnError": false,
  "steps": [
    { "command": "open", "args": ["https://example.com"] },
    { "command": "fill", "args": ["input[name=q]", "fast-browser"] },
    { "command": "press", "args": ["Enter"] }
  ]
}
```

支持的常用命令包括：

- `open`
- `snapshot`
- `click`
- `type`
- `fill`
- `press`
- `hover`
- `scroll`
- `screenshot`
- `eval`
- `wait`
- `waitForSelector`
- `site`
- `tab.new`
- `tab.switch`
- `tab.close`
- `tab.list`

## 6. 推荐开发顺序

1. 先确认是否已存在可复用 `site command`
2. 缺入口时，优先补正式导航 command
3. command 覆盖不了的真实路径，再补 `flow`
4. 需要可回归验证时，再补 `case`
5. 调试阶段少量使用 `eval` 或 `run-script`

不要反过来做。
