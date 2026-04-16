# 浏览器操作配方

当已有 `case / flow / site` 不足时，才回退到这些低层命令组合。

## 人工登录

标准动作：

```bash
fast-browser open <url> --headed
fast-browser snapshot -i --json
```

规则：

- 先由 Agent 打开有头浏览器，再要求用户在该窗口里完成登录
- 用户完成登录后，认证状态同步由 Agent 自己做，不要交给用户
- 如果任务跨多个阶段，先判断是否应固定 `--session-id`

登录后常见检查：

```bash
fast-browser browser status --json
fast-browser getUrl
fast-browser snapshot -i --json
fast-browser cookies
fast-browser localStorage
fast-browser sessionStorage
```

## DOM 探索

```bash
fast-browser snapshot -i --json
fast-browser waitForSelector <selector> --state visible
fast-browser console --clear
fast-browser network --clear
```

规则：

- `snapshot -i` 仍然是探索可点击元素的第一选择
- `snapshot` 生成的 ref 只用于探索，不应直接进入正式 `flow` 或 `case`
- 在后台页或 SPA 页面上，可以先用 `@eN` 探索，再判断是否值得提升为稳定 selector
- 页面结构明显变化后，要重新执行新的 `snapshot -i`

## 低层动作

```bash
fast-browser click --target "<target>"
fast-browser fill --target "<target>" "<text>"
fast-browser press <key>
fast-browser wait [ms|--text|--url|--fn]
fast-browser waitForSelector <selector> --state visible
```

规则：

- PowerShell 下，一律使用 `--target "@eN"`，不要裸写 `@eN`
- 关键动作后优先等待明确成功信号，不要只看动作本身是否执行
- 成功信号优先看：`waitForSelector`、`wait --text`、`wait --url`、`getUrl`、新的 `snapshot`
- 如果同一个 ref 或 selector 连续失败两次，不要盲重试，应重新探索

## 多 Tab

```bash
fast-browser tab list --json
fast-browser tab new --url "<url>"
fast-browser tab switch --id "<tabId>"
fast-browser tab close --id "<tabId>"
```

规则：

- 需要保留列表页上下文时，用 `tab new --url`
- 用 `tab switch --id` / `tab close --id`，不要靠标题或位置猜
- `tab switch` 之后，后续低层命令、`site`、`flow`、`case` 都绑定当前活动 tab
- 如果后续准备把路径沉淀成 `flow`，只保留必要的 `tabNew` / `tabSwitch`

## 长列表与内容抽取

```bash
fast-browser collect <selector> --limit 20 --scroll-step 1200 --max-rounds 4
fast-browser extract-blocks --selector <selector> --limit 20
```

规则：

- 长列表优先尝试 `collect`
- 文本块密集页面优先尝试 `extract-blocks`
- 如果页面仍需要复杂解析，把解析逻辑放进 adapter `command`，不要塞进 `flow`

## 调试与分段观察

```bash
fast-browser console --type error
fast-browser network --url <substring>
fast-browser gate --text <text>
fast-browser eval <expression>
```

规则：

- `eval` 只在现有命令看不到所需信号时才用
- `gate` 适合处理年龄确认、继续浏览、cookie 同意等前置页面
- 调试单步动作时，先清日志再做动作再读日志：

```bash
fast-browser console --clear
fast-browser network --clear
<do one action>
fast-browser console
fast-browser network
```
