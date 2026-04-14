# 浏览器操作配方

当已有 `case / flow / site` 不足时，才回退到这些低层命令组合。

## 手动登录与登录态复用

```bash
fast-browser open <url> --headed
fast-browser snapshot -i
```

说明：
- 如果站点需要人工登录，先打开有头浏览器，再等待用户完成登录
- 登录完成后，优先用 `browser status`、`getUrl`、`snapshot`、`cookies` 检查状态
- 当前正式架构是 `base profile + session clone profile`；多 session 场景下不要假设共用同一个活跃 profile
- 如果需要让新的 session 继承认证状态，先在源 session 执行 `auth sync`

## DOM 探索

```bash
fast-browser snapshot -i
fast-browser waitForSelector <selector> --state visible
fast-browser console --type error --clear
fast-browser network --clear
```

说明：
- `snapshot -i` 仍然是探索可点击元素的第一选择
- `snapshot` 生成的 ref 现在会带 selector 候选，更适合轻量重渲染页面
- 在后台页或 SPA 页面上，先用 `@eN` 探索，再考虑原始 selector
- 页面结构明显变化后，要重新执行新的 `snapshot -i`

## 低层动作

```bash
fast-browser click --target "<target>"
fast-browser fill --target "<target>" <text>
fast-browser press <key>
fast-browser wait [ms|--text|--url|--fn]
```

说明：
- 在 PowerShell 中，一律使用 `--target "@e1"`，不要裸写 `@e1`
- `click`、`fill`、`press` 现在都带恢复逻辑，但关键动作后仍要等明确成功信号
- 成功信号优先看：
  - `waitForSelector`
  - `wait`
  - `getUrl`
  - 新的 `snapshot`
- 如果同一个 ref 或 selector 连续失败两次，不要盲重试，应重新探索

## 不清楚步骤时的调试

```bash
fast-browser console --type error
fast-browser network --url <substring>
fast-browser gate [--text <text>]
fast-browser eval <expression>
```

说明：
- `eval` 只在现有命令看不到所需信号时才用
- `gate` 适合处理年龄确认、继续浏览、cookie 同意等前置页面

## 单步日志隔离

```bash
fast-browser console --clear
fast-browser network --clear
<do one action>
fast-browser console
fast-browser network
```

## 登录后检查

登录完成后，至少用下面一种方式确认状态：

```bash
fast-browser browser status
fast-browser getUrl
fast-browser snapshot -i
fast-browser cookies
fast-browser localStorage list
```

## 长列表与延迟加载

```bash
fast-browser collect <selector> --limit 20 --scroll-step 1200 --max-rounds 4
fast-browser extract-blocks --selector <selector> --limit 20
```

说明：
- 长列表优先尝试 `collect`
- 文本块密集页面优先尝试 `extract-blocks`
- 如果页面仍需要复杂解析，把解析逻辑放进 adapter command，而不是 flow

## 多 Tab 工作流

```bash
fast-browser tab list
fast-browser tab new --url "<url>"
fast-browser tab switch --id "<tabId>"
fast-browser tab close --id "<tabId>"
```

说明：
- 需要保留列表页上下文时，用 `tab new --url`
- 用 `tab switch --id` / `tab close --id`，不要靠标题或位置猜
- `tab switch` 之后，后续低层命令、`site`、`flow`、`case` 都绑定当前 tab
- 如果后续准备把这条路径沉淀成 flow，只保留必要的 `tabNew` / `tabSwitch`
