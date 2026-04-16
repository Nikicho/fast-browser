# Fast-Browser

Fast-Browser 是一个本地浏览器自动化 CLI，用来让人类和 agent 协作操作真实网站，并把跑通的稳定路径沉淀成可复用资产。

它的核心不是“再写一套临时脚本”，而是把网站能力逐步收敛到 3 个层次：

- `site <adapter>/<command>`：站点级原子能力
- `flow`：可重复执行的多步流程
- `case`：建立在 `flow` 之上的验证用例

## 简短概览

Fast-Browser 适合这类工作：

- 让 agent 操作真实浏览器完成网页任务
- 为已有网站沉淀稳定的 adapter / command / flow / case
- 为新网站快速起骨架，再通过真实任务继续收敛
- 把“这次跑通了”的路径整理成下次可直接复用的能力

当前版本要求 `Node.js 20+`。

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

如果你本来就是通过 agent 来操作网站，更省事的方式通常不是自己研究参数，而是直接把下面这段话发给 agent：

```text
请先安装并检查 fast-browser，然后做一次 preflight。确认 workspace、browser 状态和已有能力。优先复用 case、flow、site command；只有高层能力不够时才回退到低层浏览器命令。
```

给人看的入口：

- [安装 CLI](docs/install-cli.md)
- [人类操作手册](docs/HUMAN_OPERATOR_GUIDE.md)
- [CLI 完整命令手册](docs/cli-reference.md)

### For Agent

如果你是 Agent，不要从这份 README 继续往下读实现细节。直接按这个顺序工作：

1. 先看 [安装 CLI](docs/install-cli.md)
2. 再看 [安装 Fast-Browser Skill](docs/install-skills.md)
3. 再读 [仓库内 skill 入口](fast-browser-agent-skill/SKILL.md)
4. 需要查参数时再看 [CLI 完整命令手册](docs/cli-reference.md)

如果你在另一台机器上安装，建议优先使用官方 npm 源；如果镜像站缓存滞后，可能拉到旧包。

## 人类最常用的协作方式

这个 CLI 本质上是给“人类配合 agent”使用的。最常见的协作方式只有 4 条：

1. 先让 agent 做 preflight，不要一上来就 `snapshot`
2. 永远优先复用：`case` > `flow` > `site command` > 低层浏览器命令
3. 需要登录时，由 agent 打开窗口，你只负责在那个窗口里完成登录
4. 任务跑通后，如果后面还会再用，就让 agent 基于 `trace current --json` 沉淀能力

一个常见的开场指令可以直接这样给 agent：

```text
先做 fast-browser preflight，确认 workspace、browser 状态和已有能力。优先复用 case、flow、site command；只有高层能力不够时才回退到低层浏览器命令。
```

如果任务需要登录：

```text
请用 headed 模式打开登录页，我会在你打开的窗口里完成登录。登录完成后你继续往下执行，不需要我处理额外的技术细节。
```

如果任务已经跑通，准备沉淀：

```text
请先读取 trace current --json，再判断哪些步骤该提升成 command，哪些该沉淀成 flow，验证目标再沉淀成 case。
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
- Node 要求：`>=20`

如果你在 `Node 18` 上遇到 `File is not defined`、`undici` 相关报错，这不是推荐支持环境；请升级到 Node 20+。

