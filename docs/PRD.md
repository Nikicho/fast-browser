# Product Summary

Fast-Browser 的产品来源文档在根目录 [fast-browser-prd.md](../fast-browser-prd.md)。

当前产品摘要：
- 统一浏览器低层命令、site command、flow、case 四层能力
- `trace current --json` 是正式沉淀输入
- `command` 通过 `command save --from-trace` 先生成 draft，再通过 `command materialize --draft` 输出落地补丁建议
- `flow` / `case` 通过 `save/run/list` 进入正式复用链路
- `guide` 负责新站点冷启动骨架，不承担自动学习职责
