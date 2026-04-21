# Fast-Browser

Fast-Browser 是一个本地浏览器自动化 CLI，用来让人类和 agent 协作操作真实网站，并把成功路径沉淀成可复用资产。

它首先解决 Agent 访问网站时的速度、稳定性和复用问题；在这层能力之上，它也可以成为 Agent 做前端功能测试与回归验证的浏览器执行层。

它不是一套给人类手写浏览器脚本的框架，而是一层给 Agent 用的浏览器能力系统。它把网站能力逐步收敛到 3 个层次：

- `site <adapter>/<command>`：站点级原子能力
- `flow`：可重复执行的多步流程
- `case`：建立在 `flow` 之上的验证用例

当前版本要求 `Node.js 20+`。

## 核心目标

Fast-Browser 有一个核心主线，和一个建立在这条主线之上的直接用途。

### 1. 让 Agent 更快、更稳定地访问网站

这条主线关注：

- 用统一 CLI 操作真实浏览器
- 把一次成功路径沉淀成 `command / flow / case`
- 减少重复 `snapshot`、重复找 selector、重复摸页面

### 2. 在上面这层能力之上，让 Agent 参与前端功能测试与回归验证

浏览器访问得更快、更稳定，Agent 才能更高效地做功能测试。这条用途关注：

- 在开发前先把功能场景整理成可执行的测试资产
- 在开发后用 Fast-Browser + Agent 跑功能回归
- 让 `flow` 承载用户路径，让 `case` 承载验收断言
- 让 `network`、`console` 等低层能力只在调试失败时出现，而不是成为人类常用的测试主入口

如果你把 Fast-Browser 只理解成“网站自动化工具”，就会漏掉它在 Agent 功能测试链路里的价值。

## Installation

### For Humans

如果你只是想开始使用 Fast-Browser，最简单的安装方式是：

```bash
npm install -g fast-browser
fast-browser --help
fast-browser health
fast-browser workspace --json
fast-browser list
```

给人看的入口：

- [安装 CLI](docs/install-cli.md)
- [人类操作手册](docs/HUMAN_OPERATOR_GUIDE.md)
- [CLI 完整命令手册](docs/cli-reference.md)

### For Agent

如果你是 Agent，不要从这份 README 猜执行规则。直接按这个顺序工作：

1. 先看 [安装 CLI](docs/install-cli.md)
2. 再看 [安装 Fast-Browser Skill](docs/install-skills.md)
3. 再读 [仓库内 skill 入口](fast-browser-agent-skill/SKILL.md)
4. 需要查参数时再看 [CLI 完整命令手册](docs/cli-reference.md)

如果你在另一台机器上安装，建议优先使用官方 npm 源；如果镜像站缓存滞后，可能拉到旧包。

## 人类最常用的协作方式

### 做网站操作时

可以直接这样给 agent：

```text
先做 fast-browser preflight，确认 workspace、browser 状态和已有能力。优先复用 case、flow、site command；只有高层能力不够时才回退到低层浏览器命令。
```

### 做前端功能测试时

可以直接这样给 agent：

```text
这是一个前端功能测试任务。请先检查是否已有可复用的 case 或 flow；如果没有，就先明确功能路径和验收条件，再沉淀成 fast-browser 的 flow/case 资产。开发完成后，用 fast-browser 做回归验证；只有失败时才使用 console、network、screenshot 或 trace 辅助定位。
```

### 需要登录时

```text
请用 headed 模式打开登录页，我会在你打开的窗口里完成登录。登录完成后你继续往下执行，不需要我处理额外的技术细节。
```

完整的人类操作说明见：[docs/HUMAN_OPERATOR_GUIDE.md](docs/HUMAN_OPERATOR_GUIDE.md)

## 对外支持范围

当前对外承诺支持的公开表面，以这两处为准：

- `fast-browser --help` 实际暴露的命令
- [docs/cli-reference.md](docs/cli-reference.md) 中列出的命令与参数

下面这些内容不属于公共 API 承诺范围：

- `docs-internal/` 下的内部文档
- `.fast-browser/sessions/...` 下的运行时草稿与缓存
- 未写入命令手册的试验性流程和临时产物

## 版本与环境说明

- npm package：[`fast-browser`](https://www.npmjs.com/package/fast-browser)
- GitHub repo：[`Nikicho/fast-browser`](https://github.com/Nikicho/fast-browser)
- 当前发布版本：`1.0.2`
- Node 要求：`>=20`

如果你在 `Node 18` 上遇到 `File is not defined`、`undici` 相关报错，这不是推荐支持环境；请升级到 Node 20+。
## 1.0 补充文档

- Adapter 开发与 `context.runtime`：`docs/ADAPTER_DEVELOPER_GUIDE.md`
- CLI 公开命令面：`docs/cli-reference.md`
- 人类协作入口与登录协作：`docs/HUMAN_OPERATOR_GUIDE.md`

当前 1.0 推荐的默认协作顺序：

1. 先查 `list / info`
2. 优先复用已有 `site command`
3. 只有高层入口不足时，才回退到低层浏览器命令
4. 多步一次性操作优先用 `run-script`，不要堆 PowerShell `eval`

## 1.0 补充：结构化失败与自动诊断

从 1.0 开始，`flow run` 和 `case run` 在失败时不再只有一条扁平报错消息。

- 失败结果会带结构化落点信息，例如 `flowId / caseId / stepIndex / assertionIndex / command / assertionType`
- 运行期间会自动采集诊断证据摘要，默认归口到失败结果里的 `error.details.diagnostics`
- 当前自动诊断摘要会包含这些类别中的已采集项：`console`、`network`、`snapshot`、`screenshot`、`trace`
- `trace` 不会整段内联返回，而是通过 `tracePath` 提供统一读取入口

推荐协作方式：

1. 先看失败结果里的结构化落点
2. 再看 `error.details.diagnostics`
3. 只有需要深入定位时，再读取 `trace current`、`console`、`network`、`screenshot`
