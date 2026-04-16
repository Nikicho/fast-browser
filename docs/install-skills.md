# Fast-Browser Skill 安装说明

这份文档写给 Agent。

仓库内已经提供了一个可直接复用的 skill 目录：

- [fast-browser-agent-skill/SKILL.md](../fast-browser-agent-skill/SKILL.md)

它的目标不是替代 CLI，而是让 Agent 以正确方式使用 CLI。

实际阅读顺序应是：先看 skill，再按需查 CLI 命令手册。

它主要约束 agent：

- 先复用已有 `case / flow / site command`
- 只在必要时回退到低层浏览器命令
- 基于 `trace current --json` 沉淀稳定能力
- 在多 session 场景下显式固定 `--session-id`

## 安装前提

先完成 CLI 安装：

- [安装 CLI](./install-cli.md)

并确认下面命令已经可用：

```bash
fast-browser --help
fast-browser health
```

## 仓库里有哪些 agent 资产

`fast-browser-agent-skill/` 目前包含：

- `SKILL.md`：skill 主说明
- `agents/openai.yaml`：agent 元数据
- `references/`：工作流与规则参考
- `assets/`：模板文件
- `scripts/`：辅助脚本

## 通用安装方式

不同 agent 平台的 skills 目录不完全一样，但原则相同：把整个 `fast-browser-agent-skill/` 复制到该平台的本地 skills 目录中，并保持目录结构完整。

推荐做法：

1. 复制整个 `fast-browser-agent-skill/`
2. 在目标平台的 skills 根目录下放成一个独立目录
3. 目录名建议统一为 `fast-browser-agent`
4. 重启 agent 宿主程序
5. 验证该 skill 已被识别

## Codex / OpenCode 技能目录示例

如果你使用的是本地技能目录模式，可以参考下面的目标位置：

```text
%USERPROFILE%\.codex\skills\fast-browser-agent
%USERPROFILE%\.config\opencode\skills\fast-browser-agent
%USERPROFILE%\.agents\skills\fast-browser-agent
```

实际路径以你的 agent 平台约定为准。关键不是路径名字，而是：

- `SKILL.md` 能被扫描到
- 相关引用文件仍然存在
- agent 能在会话中读取到这份 skill

## 验证方式

安装完成后，可以直接让 agent 执行一个最小检查：

```text
请使用 fast-browser-agent skill，先执行 fast-browser preflight，再告诉我当前 workspace、browser 状态和已有 site/flow/case 概况。
```

如果 agent 的第一步就是：

- `fast-browser health`
- `fast-browser workspace --json`
- `fast-browser browser status --json`
- `fast-browser list`

说明 skill 至少已经在基本路径上生效了。

## 推荐搭配

如果你是 Agent，建议只保留这 3 个入口：

- [安装 CLI](./install-cli.md)
- [安装 Skill](./install-skills.md)
- [CLI 命令手册](./cli-reference.md)

至于行为约束、交互策略和工作方式，直接看仓库内的 skill 即可，不要再从公开 README 猜执行规则。