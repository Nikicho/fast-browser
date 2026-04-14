# Architecture Summary

核心链路：CLI -> CommandRouter -> AdapterManager -> Adapter/Cache/Runtime。

原则：
- 站点差异留在 adapter 内
- 统一错误与结果结构
- 缓存与运行时对 adapter 透明
- Guide 通过同一套 manifest 约束生成新 adapter
