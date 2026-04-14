# Adapter Guide

自定义 adapter 放在根目录 `adapters/<platform>/`。

最小结构：
- `manifest.json`
- `index.ts` 或 `index.js`
- 可选 `commands/`

运行约束：
- 导出 `adapter` 或默认导出
- `manifest.commands[*].args` 定义参数模式
- 可缓存命令显式标记 `cacheable: true`
- 所有结果返回统一 `AdapterResult`
