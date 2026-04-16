# Fast-Browser CLI 安装说明

这份文档面向两类读者：

- 人类操作者：想在自己的机器上安装 `fast-browser`
- Agent：想先装好 CLI，再在后续任务里调用它

## 环境要求

- `Node.js 20+`
- `npm 10+` 为佳
- Windows、macOS、Linux 均可，当前仓库主要在 Windows + PowerShell 环境下验证

不建议使用 Node 18。当前依赖链中存在要求 Node 20+ 的包，Node 18 上常见症状包括：

- `File is not defined`
- `undici` 相关运行时报错

## 安装方式

全局安装：

```bash
npm install -g fast-browser
```

只做一次性调用：

```bash
npx fast-browser@latest --help
```

## 安装后自检

建议至少跑下面这几条：

```bash
fast-browser --help
fast-browser health
fast-browser workspace --json
fast-browser browser status --json
fast-browser list
```

你应该重点确认：

- CLI 能正常启动
- workspace 能被正确识别
- 浏览器运行时状态可读
- 已有 adapter / flow / case 可以被列出来

## Windows 与 PowerShell 注意事项

如果你要传 `snapshot` 产生的引用，例如 `@e57`，不要直接这样写：

```bash
fast-browser click @e57
```

在 PowerShell 下应改成：

```bash
fast-browser click --target "@e57"
fast-browser fill --target "@e12" "hello"
```

原因是 PowerShell 可能把裸写的 `@...` 当成特殊语法处理，导致 CLI 根本收不到这个参数。

## 镜像站注意事项

如果你通过镜像站安装，遇到以下现象：

- 明明 npm 官方已经有新版本，镜像站还拉到旧版本
- 安装行为和 README / GitHub 上看到的不一致

优先排查镜像缓存滞后。最直接的做法是切回官方源重新安装：

```bash
npm install -g fast-browser --registry=https://registry.npmjs.org
```

## 从源码仓库本地验证

如果你在仓库里做开发，可以直接运行：

```bash
npm install
npm run dev -- --help
npm run test
npm run typecheck
```

## 下一步

安装 CLI 之后：

- 如果你是人类操作者，继续看 [人类操作手册](./HUMAN_OPERATOR_GUIDE.md)
- 如果你是 Agent，继续看 [安装 Fast-Browser Skill](./install-skills.md) 和仓库内的 `fast-browser-agent-skill/SKILL.md`


