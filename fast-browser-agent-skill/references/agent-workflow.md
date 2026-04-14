# Agent Workflow

## A. 已有站点任务

1. 执行预检：
   - `fast-browser health`
   - `fast-browser workspace --json`
   - `fast-browser browser status --json`
   - `fast-browser list`
2. 如果任务是多 session，固定显式 `--session-id`
3. 查询已有能力：
   - `fast-browser info <site> --json`
   - `fast-browser info <site>/<command> --json`
4. 按优先级复用：
   - `case run`
   - `flow run`
   - `site <adapter>/<command>`
5. 如果任务需要多 tab：
   - 优先 `tab new --url "<url>"`
   - 用 `tab switch --id "<tabId>"` 切回已知 tab
   - 记住之后的低层命令、`site`、`flow`、`case` 都绑定当前活动 tab
6. 只有高层资产不够时，才使用低层命令探索
7. 打 trace 边界：
   - `trace mark --type goal_start ...`
   - 成功后 `trace mark --type goal_success ...`
8. 读取：
   - `fast-browser trace current --json`
9. 检查：
   - `entries[]`
   - `discarded[]`
   - `locator.*`
   - `flowSafe`
   - `commandCandidate`
10. 使用正式 CLI 路径沉淀：
   - `fast-browser flow save --site <site> --from-trace --id <flowId> --goal "<goal>"`
   - `fast-browser case save --site <site> --id <caseId> --goal "<goal>" --flow <flowId>`
11. 最后验证：
   - `flow list` / `case list`
   - 至少跑一次 `flow run` / `case run`

## B. 新站点任务

1. 执行预检
2. 找稳定直达路由，不要先固化首页壳层点击
3. 执行：
   - `fast-browser guide inspect --url <url>`
   - `fast-browser guide plan ...`
   - `fast-browser guide scaffold ...`
4. 检查生成文件是否落在 `src/adapters/<site>/...`
5. 做一次真实任务
6. 成功后读取 `trace current --json`
7. 把 guide 没推断好的部分人工收敛
8. 再沉淀成正式 `command / flow / case`

## 规则

- 不要依赖聊天上下文回忆步骤，保存前一定先读 `trace current --json`
- 不要把 `.fast-browser/sessions/...` 里的临时草稿当正式 adapter 资产
- `flow` 默认作用于当前 tab；只在切页时显式保存 `tabNew` / `tabSwitch`
- `click` / `fill` / `press` 只有在 target 稳定时才应进入正式 flow
- 不要把 `snapshot`、裸 `@eN`、真实 tabId 直接存进正式 flow
- 不要假设 `open` 一定会新开 tab
- 外部站点专用工具只能算 `exploration-assisted`
