# 新站点起步

`guide` 只用来创建 starter，不要把 `guide` 的输出当成成熟知识。

## 先确认保存位置

任何 scaffold 或保存动作前，先执行：

```bash
fast-browser workspace --json
```

只相信 CLI 返回的：

- `projectRoot`
- `adaptersDir`

不要因为 skill 安装目录正好开着，就把新 adapter 保存到 skill 目录里。新资产应落到活动 Fast-Browser workspace。

更多位置规则见：

- [storage-location.md](storage-location.md)

## 起步顺序

对于登录后台、创作者平台、SPA app shell，一开始先找最稳定的直达入口，不要先固化首页壳层点击。

推荐顺序：

```bash
fast-browser workspace --json
fast-browser guide inspect --url <url>
fast-browser guide plan --platform <site> --url <url> --capability "<capability>" --strategy auto --command <command> --ttl-seconds 60
fast-browser guide scaffold --platform <site> --url <url> --capability "<capability>" --strategy auto --command <command> --ttl-seconds 60 --run-test
```

## Scaffold 后立刻检查

立刻检查：

- 生成的 `manifest`
- 生成的 command 源码
- 生成的 starter flow
- smoke test 结果
- scaffold 输出里的真实 `rootDir`

然后至少做一件真实任务，并总结 `guide` 没推断好的部分。

## Guide 的边界

`guide` 负责：

- 初始 adapter 骨架
- 命令参数的初步推断
- starter flow 生成

`guide` 不负责：

- 自动长程学习
- 自动区分失败分支与成功分支
- 不经审查就产出生产级 adapter / flow

## 验收规则

- 如果探索阶段借助了外部站点专用工具，最终仍要回到 Fast-Browser 自己的命令链重新验证
- 如果站点是登录后的 app shell，要尽量把装饰性的首页入口替换成稳定的直达路由
