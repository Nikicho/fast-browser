# Fast-Browser CLI 完整命令手册

这份文档是当前版本的公开命令手册。

对外承诺支持的范围，以本文和 `fast-browser --help` 为准。`docs-internal/`、运行时草稿目录、未写入本文的试验性内容，不属于公共支持面。

当前环境要求：`Node.js 20+`

给人看的主路径通常应优先是 `case / flow / site`。`console / network / screenshot / trace latest` 这类能力主要用于失败定位，而不是日常人工主入口。

## 约定

- `site`：adapter 名称，例如 `zhihu`
- `target`：命令目标，可为稳定 selector、文本目标或 `snapshot` 产生的 ref；实际解析以运行时为准
- `@eN`：`snapshot` 产生的元素引用
- `--json`：命令返回机器可读结果，适合 agent 使用
- PowerShell 下传 `@eN` 时，请使用 `--target "@eN"`

## 一、环境与状态

### `fast-browser health`

用途：检查 CLI 与运行环境是否健康。

```bash
fast-browser health
fast-browser health --json
```

参数：

- `--json`

### `fast-browser workspace`

用途：读取当前 workspace 配置与目录。

```bash
fast-browser workspace
fast-browser workspace --json
```

参数：

- `--json`

### `fast-browser list`

用途：列出当前 workspace 内可见的 adapter、command、flow、case。

```bash
fast-browser list
fast-browser list --json
```

参数：

- `--json`

### `fast-browser info <adapter>`

用途：查看某个 adapter 或某个 `site/<command>` 的详细信息。

```bash
fast-browser info zhihu
fast-browser info zhihu/search
fast-browser info zhihu/search --json
```

参数：

- `--json`

## 二、浏览器实例与会话

### `fast-browser browser status`

用途：查看当前浏览器运行状态。

```bash
fast-browser browser status
fast-browser browser status --json
```

参数：

- `--json`

### `fast-browser browser close`

用途：关闭当前浏览器实例。

```bash
fast-browser browser close
fast-browser browser close --json
```

参数：

- `--json`

### `fast-browser session pin`

用途：固定当前 session，避免被清理。

```bash
fast-browser session pin
fast-browser session pin --json
```

参数：

- `--json`

### `fast-browser session unpin`

用途：取消固定当前 session。

```bash
fast-browser session unpin
```

### `fast-browser session status`

用途：查看当前 session 状态。

```bash
fast-browser session status
fast-browser session status --json
```

参数：

- `--json`

### `fast-browser session list`

用途：列出可见 session。

```bash
fast-browser session list
fast-browser session list --json
```

参数：

- `--json`

### `fast-browser session cleanup`

用途：清理过旧 session。

```bash
fast-browser session cleanup
fast-browser session cleanup --max-age-hours 24
fast-browser session cleanup --json
```

参数：

- `--max-age-hours <number>`
- `--json`

### `fast-browser auth sync`

用途：同步认证状态，常用于人工登录完成之后。

```bash
fast-browser auth sync
fast-browser auth sync --json
```

参数：

- `--json`

说明：通常由 agent 在人工登录完成后自行触发，而不是作为人类日常主入口。

## 三、页面与低层浏览器命令

### `fast-browser open <url>`

用途：打开指定 URL。

```bash
fast-browser open "https://example.com"
fast-browser open "https://example.com" --headed
fast-browser open "https://example.com" --headless --json
```

参数：

- `--headed`
- `--headless`
- `--json`

### `fast-browser snapshot`

用途：抓取当前页面的可交互元素与引用。

```bash
fast-browser snapshot
fast-browser snapshot -i
fast-browser snapshot --selector ".result-item"
fast-browser snapshot --max-items 20 --json
```

参数：

- `-i, --interactive-only`
- `--selector <selector>`
- `--max-items <number>`
- `--json`

### `fast-browser click [target]`

用途：点击目标元素。

```bash
fast-browser click --target "@e57"
fast-browser click "登录"
fast-browser click --timeout 8000 --json
```

参数：

- `--target <target>`
- `--timeout <ms>`
- `--json`

### `fast-browser type [target] <text>`

用途：键盘逐字输入文本。

```bash
fast-browser type --target "@e12" "hello"
fast-browser type "#search" "关键词" --delay 50 --json
```

参数：

- `--target <target>`
- `--delay <ms>`
- `--json`

### `fast-browser fill [target] <text>`

用途：直接填充输入框。

```bash
fast-browser fill --target "@e12" "hello"
fast-browser fill "#keyword" "fast-browser" --timeout 5000
```

参数：

- `--target <target>`
- `--timeout <ms>`
- `--json`

### `fast-browser press <key>`

用途：发送键盘按键。

```bash
fast-browser press Enter
fast-browser press Escape --json
fast-browser press Enter --target "@e12"
```

参数：

- `--target <target>`
- `--json`

### `fast-browser hover [target]`

用途：悬停到目标元素。

```bash
fast-browser hover --target "@e20"
fast-browser hover ".menu-item" --timeout 4000 --json
```

参数：

- `--target <target>`
- `--timeout <ms>`
- `--json`

### `fast-browser scroll [targetOrDirection] [amount]`

用途：滚动页面或元素。

```bash
fast-browser scroll down 800
fast-browser scroll --target ".list-container" 600
fast-browser scroll up 400 --json
```

参数：

- `--target <target>`
- `--json`

### `fast-browser screenshot [path]`

用途：截图当前页面。

```bash
fast-browser screenshot
fast-browser screenshot "page.png"
fast-browser screenshot "full.png" --full-page --json
```

参数：

- `--full-page`
- `--json`

说明：在前端功能测试场景里，`screenshot` 更适合作为失败证据，而不是人类日常主入口。

### `fast-browser eval <expression>`

用途：执行页面表达式。

```bash
fast-browser eval "document.title"
fast-browser eval "location.href" --json
```

参数：

- `--json`

### `fast-browser goback`

用途：浏览器后退。

```bash
fast-browser goback
```

### `fast-browser goforward`

用途：浏览器前进。

```bash
fast-browser goforward
```

### `fast-browser reload`

用途：刷新当前页面。

```bash
fast-browser reload
```

### `fast-browser getUrl`

用途：读取当前 URL。

```bash
fast-browser getUrl
```

### `fast-browser getTitle`

用途：读取当前页面标题。

```bash
fast-browser getTitle
```

### `fast-browser wait [ms]`

用途：等待固定时间，或等待文本 / URL / 函数条件。

```bash
fast-browser wait 1000
fast-browser wait --text "发布成功"
fast-browser wait --url "/dashboard"
fast-browser wait --fn "document.readyState === 'complete'" --json
```

参数：

- `--text <text>`
- `--url <text>`
- `--fn <expression>`
- `--json`

### `fast-browser waitForSelector <selector>`

用途：等待 selector 达到指定状态。

```bash
fast-browser waitForSelector ".result-list"
fast-browser waitForSelector ".toast-success" --state visible
fast-browser waitForSelector "#loading" --state hidden --timeout 10000 --json
```

参数：

- `--state <attached|detached|visible|hidden>`
- `--timeout <ms>`
- `--json`

### `fast-browser gate`

用途：等待一个更高层的门槛条件，常用于流程分界。

```bash
fast-browser gate --text "已发布"
fast-browser gate --text "欢迎回来" --json
```

参数：

- `--text <text>`
- `--json`

### `fast-browser collect <selector>`

用途：批量采集符合 selector 的元素块。

```bash
fast-browser collect ".result-card"
fast-browser collect ".feed-item" --limit 20
fast-browser collect ".comment" --scroll-step 800 --max-rounds 5 --json
```

参数：

- `--limit <number>`
- `--scroll-step <number>`
- `--max-rounds <number>`
- `--json`

### `fast-browser extract-blocks`

用途：从页面中抽取结构化块。

```bash
fast-browser extract-blocks
fast-browser extract-blocks --selector ".article"
fast-browser extract-blocks --selector ".feed-item" --limit 10 --json
```

参数：

- `--selector <selector>`
- `--limit <number>`
- `--json`

## 四、Tab 与页面观测

### `fast-browser tab list`

用途：列出当前 tab。

```bash
fast-browser tab list
fast-browser tab list --json
```

参数：

- `--json`

### `fast-browser tab new [url]`

用途：打开新 tab，可附带 URL。

```bash
fast-browser tab new
fast-browser tab new "https://example.com"
fast-browser tab new --url "https://example.com" --json
```

参数：

- `--url <url>`
- `--json`

### `fast-browser tab switch [target]`

用途：切换到指定 tab。

```bash
fast-browser tab switch 2
fast-browser tab switch --id "<tabId>"
fast-browser tab switch --id "<tabId>" --json
```

参数：

- `--id <tabId>`
- `--json`

### `fast-browser tab close [target]`

用途：关闭指定 tab。

```bash
fast-browser tab close 2
fast-browser tab close --id "<tabId>"
fast-browser tab close --id "<tabId>" --json
```

参数：

- `--id <tabId>`
- `--json`

### `fast-browser console`

用途：查看或过滤浏览器 console 输出，也可清空。

```bash
fast-browser console
fast-browser console --type error
fast-browser console --text "warning" --json
fast-browser console --clear
```

参数：

- `--type <type>`
- `--text <text>`
- `--clear`
- `--json`

说明：主要用于失败排查，不建议作为人类日常测试主入口。

### `fast-browser network`

用途：查看或过滤网络请求，也可清空。

```bash
fast-browser network
fast-browser network --url "/api/search"
fast-browser network --method POST --status 200 --json
fast-browser network --resource-type xhr
fast-browser network --clear
```

参数：

- `--url <text>`
- `--method <method>`
- `--status <code>`
- `--resource-type <type>`
- `--clear`
- `--json`

说明：主要用于失败排查，不建议作为人类日常测试主入口。

### `fast-browser performance`

用途：查看性能指标摘要。

```bash
fast-browser performance
fast-browser performance --json
```

参数：

- `--json`

## 五、Cookies 与 Storage

### `fast-browser cookies [action]`

用途：查看、设置或处理 cookies。

```bash
fast-browser cookies
fast-browser cookies set --name token --value abc --url "https://example.com"
fast-browser cookies --json
```

参数：

- `--name <name>`
- `--value <value>`
- `--url <url>`
- `--json`

说明：支持的具体 action 以命令帮助输出为准。

### `fast-browser localStorage [action] [key] [value]`

用途：读取或修改 localStorage。

```bash
fast-browser localStorage
fast-browser localStorage get token
fast-browser localStorage set token abc --json
```

参数：

- `--json`

说明：支持的具体 action 以命令帮助输出为准。

### `fast-browser sessionStorage [action] [key] [value]`

用途：读取或修改 sessionStorage。

```bash
fast-browser sessionStorage
fast-browser sessionStorage get token
fast-browser sessionStorage set token abc --json
```

参数：

- `--json`

说明：支持的具体 action 以命令帮助输出为准。

## 六、站点能力与复用资产

### `fast-browser site <target> [args...]`

用途：运行某个正式 adapter command。

```bash
fast-browser site zhihu/search --keyword "AI"
fast-browser site google/search --input '{"query":"fast-browser"}'
fast-browser site github/search --input '{"query":"openai"}' --json
```

参数：

- `--input <json>`
- `--no-cache`
- `--json`

### `fast-browser command save`

用途：基于当前 `trace current` 生成 command draft。

```bash
fast-browser command save --site zhihu --from-trace --id open-hot --goal "打开知乎热榜"
fast-browser command save --site zhihu --from-trace --id open-hot --goal "打开知乎热榜" --json
```

参数：

- `--site <site>`
- `--from-trace`
- `--id <id>`
- `--goal <goal>`
- `--json`

说明：当前公开保存路径要求同时带上 `--from-trace --id --goal`。

### `fast-browser command materialize`

用途：把 command draft 转成正式落地建议。

```bash
fast-browser command materialize --draft ".fast-browser/sessions/<session>/drafts/commands/zhihu/open-hot.json"
fast-browser command materialize --draft "<draft-path>" --json
```

参数：

- `--draft <path>`
- `--json`

说明：该命令输出的是补丁建议，不会直接改动正式 adapter 源码。

### `fast-browser flow save`

用途：保存正式 flow，可从文件保存，也可从 trace 生成。

从文件保存：

```bash
fast-browser flow save --site zhihu --file ".\\open-hot.flow.json"
fast-browser flow save --site zhihu --file ".\\open-hot.flow.json" --json
```

从 trace 生成：

```bash
fast-browser flow save --site zhihu --from-trace --id open-hot --goal "打开知乎热榜"
```

参数：

- `--site <site>`
- `--file <path>`
- `--id <id>`
- `--goal <goal>`
- `--from-trace`
- `--json`

说明：必须二选一：

- `--file <path>`
- `--from-trace --id <id> --goal <goal>`

### `fast-browser flow list [site]`

用途：列出 flow。

```bash
fast-browser flow list
fast-browser flow list zhihu
fast-browser flow list zhihu --json
```

参数：

- `--json`

### `fast-browser flow run <target> [args...]`

用途：运行 flow。

```bash
fast-browser flow run zhihu/open-hot
fast-browser flow run zhihu/search-open --keyword AI
fast-browser flow run zhihu/search-open --input '{"keyword":"AI"}' --json
```

参数：

- `--input <json>`
- `--json`

### `fast-browser case save`

用途：保存 case，可从文件保存，也可基于已有 flow 生成。

从文件保存：

```bash
fast-browser case save --site zhihu --file ".\\hot.case.json"
```

基于 flow 生成：

```bash
fast-browser case save --site zhihu --id hot-page-loads --goal "验证热榜页可打开" --flow open-hot
fast-browser case save --site zhihu --id hot-page-loads --goal "验证热榜页可打开" --flow open-hot --url-includes "/hot" --title-not-empty --json
```

参数：

- `--site <site>`
- `--file <path>`
- `--id <id>`
- `--goal <goal>`
- `--flow <flowId>`
- `--url-includes <text>`
- `--text-includes <text>`
- `--selector-visible <selector>`
- `--title-not-empty`
- `--json`

说明：必须二选一：

- `--file <path>`
- `--id <id> --goal <goal> --flow <flowId>`

### `fast-browser case list [site]`

用途：列出 case。

```bash
fast-browser case list
fast-browser case list zhihu
fast-browser case list zhihu --json
```

参数：

- `--json`

### `fast-browser case run <target> [args...]`

用途：运行 case。

```bash
fast-browser case run zhihu/hot-page-loads
fast-browser case run bilibili/popular-page-loads --json
fast-browser case run zhihu/search-route-loads --input '{"keyword":"AI"}'
```

参数：

- `--input <json>`
- `--json`

## 七、Guide：为新站点起骨架

### `fast-browser guide inspect`

用途：对目标 URL 做基础检查。

```bash
fast-browser guide inspect --url "https://example.com"
```

参数：

- `--url <url>`
- `--json`

### `fast-browser guide plan`

用途：为新站点生成 adapter 规划。

```bash
fast-browser guide plan --platform zhihu --url "https://www.zhihu.com/hot" --capability "热榜搜索"
fast-browser guide plan --platform zhihu --url "https://www.zhihu.com/hot" --capability "热榜搜索" --strategy auto --command search --ttl-seconds 300 --cacheable --run-test --json
```

参数：

- `--platform <name>`
- `--url <url>`
- `--capability <text>`
- `--strategy <auto|network|dom>`
- `--command <name>`
- `--ttl-seconds <number>`
- `--requires-login`
- `--no-requires-login`
- `--cacheable`
- `--no-cacheable`
- `--run-test`
- `--no-run-test`
- `--json`

说明：非交互运行时，至少需要：

- `--platform`
- `--url`
- `--capability`

### `fast-browser guide scaffold`

用途：为新站点落地 adapter 骨架。

```bash
fast-browser guide scaffold --platform zhihu --url "https://www.zhihu.com/hot" --capability "热榜搜索"
fast-browser guide scaffold --platform zhihu --url "https://www.zhihu.com/hot" --capability "热榜搜索" --strategy network --command search --requires-login --json
```

参数：

- `--platform <name>`
- `--url <url>`
- `--capability <text>`
- `--strategy <auto|network|dom>`
- `--command <name>`
- `--ttl-seconds <number>`
- `--requires-login`
- `--no-requires-login`
- `--cacheable`
- `--no-cacheable`
- `--run-test`
- `--no-run-test`
- `--json`

说明：非交互运行时，至少需要：

- `--platform`
- `--url`
- `--capability`

## 八、Trace

### `fast-browser trace latest [limit]`

用途：查看原始 trace 事件。

```bash
fast-browser trace latest
fast-browser trace latest 50
fast-browser trace latest 50 --json
```

参数：

- `--json`

### `fast-browser trace mark`

用途：手动记录 trace 边界或检查点。

```bash
fast-browser trace mark --type goal_start --label "打开知乎热榜"
fast-browser trace mark --type checkpoint --label "进入热榜页"
fast-browser trace mark --type goal_success --label "打开知乎热榜" --data '{"url":"/hot"}' --json
```

参数：

- `--type <type>`
- `--label <text>`
- `--data <json>`
- `--json`

### `fast-browser trace current`

用途：读取当前成功路径的整理视图；正式沉淀前优先读它。

```bash
fast-browser trace current
fast-browser trace current --json
```

参数：

- `--json`

## 九、缓存与测试

### `fast-browser cache stats`

用途：查看缓存统计。

```bash
fast-browser cache stats
```

### `fast-browser cache clear [adapter]`

用途：清理缓存，可按 adapter 清理或全量清理。

```bash
fast-browser cache clear zhihu
fast-browser cache clear --all
fast-browser cache clear zhihu --json
```

参数：

- `--all`
- `--json`

### `fast-browser test <adapter> [command]`

用途：运行 adapter 相关测试。

```bash
fast-browser test zhihu
fast-browser test zhihu search
fast-browser test zhihu search --json
```

参数：

- `--json`

## 十、推荐的最小工作顺序

已有站点任务：

```bash
fast-browser health
fast-browser workspace --json
fast-browser browser status --json
fast-browser list
fast-browser info <site> --json
fast-browser info <site>/<command> --json
```

如刚完成人工登录，再补：

```bash
fast-browser auth sync
```

新站点任务：

```bash
fast-browser guide inspect --url <url>
fast-browser guide plan --platform <name> --url <url> --capability "<capability>"
fast-browser guide scaffold --platform <name> --url <url> --capability "<capability>"
```

沉淀任务：

```bash
fast-browser trace current --json
fast-browser command save --site <site> --from-trace --id <id> --goal "<goal>"
fast-browser flow save --site <site> --from-trace --id <id> --goal "<goal>"
fast-browser case save --site <site> --id <id> --goal "<goal>" --flow <flowId>
```

## 十一、面向前端功能测试的推荐路径

开发前先查现有资产：

```bash
fast-browser list
fast-browser case list <site>
fast-browser flow list <site>
fast-browser info <site> --json
```

开发完成后优先跑回归：

```bash
fast-browser case run <site>/<case>
fast-browser flow run <site>/<flow>
```

只有失败时再做诊断：

```bash
fast-browser screenshot --full-page
fast-browser trace current --json
fast-browser console --type error --json
fast-browser network --status 400 --json
```

原则：

- `case` 是人类和 agent 的第一验证入口
- `flow` 用来复跑用户路径
- `site` 用来补原子业务动作
- `console / network` 用来解释失败，不用来代替测试资产
## 1.0 补充：eval 与 run-script

### `fast-browser eval [expression]`

现在支持 3 种输入方式，三选一：

```bash
fast-browser eval "document.title"
fast-browser eval --expr "location.href"
fast-browser eval --file ".\\expr.js"
```

适用建议：

- 单个表达式：直接 `eval`
- PowerShell 下有复杂引号：优先 `--file`
- 多步浏览器操作：不要堆多个 `eval`，改用 `run-script`

### `fast-browser run-script <path>`

用途：从 JSON 文件执行多步浏览器操作。

```bash
fast-browser run-script ".\\search.browser.json"
fast-browser run-script ".\\search.browser.json" --json
```

脚本格式：

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

常用支持命令：

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

## 1.0 补充：snapshot 结构化定位

`snapshot -i --json` 现在会返回更丰富的交互元素信息，常见字段包括：

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

推荐优先级：

1. 先用 `selectors` 里的稳定语义选择器
2. 再退回 `selector`
3. 不要把 `@eN` 永久写进正式 `flow / case`

## 1.0 补充：`flow run` / `case run` 失败输出

现在这两个命令失败时，会通过统一错误出口返回结构化 JSON：

- `error.code`
- `error.message`
- `error.stage`
- `error.details`

其中 `error.details` 重点字段包括：

- `flow` 失败：`flowId`、`failureType`、`stepIndex`、`stepType`、`command`、`assertionIndex`、`assertionType`
- `case` 失败：`caseId`、`failureType`、`useIndex`、`useFlowId`、`flowFailure`、`assertionIndex`、`assertionType`
- 自动诊断摘要：`error.details.diagnostics`

`diagnostics` 常见字段：

- `available`
- `consoleCount`
- `networkCount`
- `snapshot`
- `screenshotPath`
- `tracePath`

推荐读取顺序：

1. 先看 `error.details` 里的失败落点
2. 再看 `error.details.diagnostics.available`
3. 需要深挖时，再执行：

```bash
fast-browser trace current --json
fast-browser console --json
fast-browser network --json
fast-browser screenshot --full-page
```
