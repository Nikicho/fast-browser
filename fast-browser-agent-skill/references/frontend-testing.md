# 前端功能测试工作流

Fast-Browser 的测试用途建立在同一套网站访问能力上。

不要把它理解成“另一套测试框架”。
对人类暴露出来的主入口仍然应该是：

1. `case`
2. `flow`
3. `site`

`console / network / screenshot / trace` 只属于失败诊断层。

## 先向用户确认什么

如果用户给的是测试任务，但信息还不够，先补齐：

- 入口页面或目标 URL
- 关键用户路径
- 成功标准或验收断言
- 是否依赖登录
- 测试环境是本地开发、预发，还是真实网站

如果这些信息还缺，先对齐，再决定是否创建或更新正式资产。

## 优先执行顺序

开发前或回归前，先查已有资产：

```bash
fast-browser list
fast-browser case list <site>
fast-browser flow list <site>
fast-browser info <site> --json
```

执行顺序：

1. 能跑 `case` 就先跑 `case`
2. 没有稳定 `case` 再跑 `flow`
3. 缺少高层资产时，再补 `site` 或低层探索

## 什么时候该补资产

如果已有 `flow` 但没有 `case`，而任务本质是回归验证，优先补 `case`。

如果连稳定路径都没有，先补 `flow`。

如果路径里存在站点特定、稳定、原子的动作，再考虑提炼 `command`。

一个简单判断：

- 用户路径 -> `flow`
- 验收断言 -> `case`
- 原子站点能力 -> `command`

## 回归失败时怎么做

失败后，先保留高层语义，再补诊断证据。

建议顺序：

```bash
fast-browser screenshot --full-page
fast-browser trace current --json
fast-browser console --type error --json
fast-browser network --status 400 --json
```

必要时再补：

```bash
fast-browser getUrl
fast-browser getTitle
fast-browser waitForSelector <selector> --state visible
```

给用户汇报时，先说：

- 哪条路径失败了
- 哪一步或哪条断言失败了
- 当前拿到的关键证据是什么

不要先把原始日志直接甩给用户。

## 不要这样做

不要把测试任务退化成下面这些模式：

- 一上来就读 `console`
- 一上来就抓 `network`
- 让人类自己决定调试顺序
- 把低层浏览器步骤直接当 `case`
- 把临时 ref、临时 selector、聊天总结保存成正式资产

## 验收边界

最终测试结论必须回到 Fast-Browser 自己的执行链上：

- `case run`
- `flow run`
- `site`
- 或必要的低层命令

如果探索借助了外部站点专用工具，它只能算辅助探索，不能直接算 Fast-Browser 的正式测试资产已经完成。
