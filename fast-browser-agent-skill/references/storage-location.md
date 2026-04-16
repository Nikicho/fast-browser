# 资产保存位置

Fast-Browser 的可复用资产，不应该保存在 skill 包目录里。

## 先分清两种目录

始终区分下面两个位置：

- skill 安装目录：当前编码工具保存这份 skill 的地方
- Fast-Browser workspace：`fast-browser` 实际运行、并且 adapter / flow / case 应落地的地方

只有第二个位置才是正式资产目录。

## 正式资产应该保存到哪里

应保存到活动 Fast-Browser workspace：

```text
<workspace>/src/adapters/<site>/manifest.json
<workspace>/src/adapters/<site>/commands/*.ts
<workspace>/src/adapters/<site>/flows/*.flow.json
<workspace>/src/adapters/<site>/cases/*.case.json
```

当前 CLI 会相对活动 workspace 解析自定义 adapter，而不是相对 skill 目录解析。

解析顺序：

- 如果设置了 `FAST_BROWSER_ROOT`，优先使用它
- 否则使用当前 Fast-Browser CLI 包根目录

## 以 CLI 为唯一准绳

在 scaffold 或保存任何资产前，先执行：

```bash
fast-browser workspace --json
```

从输出里读取：

- `projectRoot`
- `adaptersDir`

不要根据 skill 路径、编辑器当前打开的标签页，或记忆里的仓库路径去猜保存位置。

## 各工具的 skill 目录不是资产目录

不同编码工具可能把这份 skill 安装在不同位置，例如：

- Codex：工具自己的 skill 目录
- Claude Code：工具自己的 skill 目录
- OpenCode：`~/.config/opencode/skills`

这些目录只是用来读取 skill 的。除非它碰巧也是当前 Fast-Browser workspace，否则不要把 adapter scaffold 到那里。

## 实际检查顺序

在 scaffold 或保存前：

1. 运行 `fast-browser workspace --json`
2. 确认 `projectRoot` 是你想使用的 Fast-Browser CLI 包根目录
3. 确认 `adaptersDir` 就是正式资产应落地的目录
4. 除非你是在维护 skill 本身，否则不要改 skill 包目录

## 错误与正确示例

错误：

- 因为当前打开的是 skill 文件，就把 `src/adapters/<site>` 保存到 skill 包目录
- 因为浏览器任务笔记开在另一个仓库，就把 `src/adapters/<site>` 保存到那个无关仓库

正确：

- 始终把 `src/adapters/<site>` 保存到 `fast-browser workspace --json` 返回的 `adaptersDir` 下

## 浏览器登录态与运行时状态

adapter、flow、case 是 workspace 资产。

浏览器登录态是另一类东西：

- Fast-Browser 默认使用用户级共享浏览器 profile
- 默认 profile 目录：`%USERPROFILE%\.fast-browser\chrome-profile`
- 默认浏览器运行时状态文件：`%USERPROFILE%\.fast-browser\sessions\browser-state.json`

这意味着：只要在同一台机器上使用同一个已安装的 Fast-Browser CLI，不同编码工具之间可以共享浏览器登录态。
