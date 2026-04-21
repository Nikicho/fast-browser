# Fast-Browser 1.0.2

Fast-Browser `1.0.2` 是一个小版本修复，目标很明确：纠正全局安装场景下的目录边界。

## Highlights

- 修复全局安装场景下 `appDir / cache / sessions / trace / screenshots` 错误写入安装包目录的问题
- 统一把运行时状态落到用户目录 `.fast-browser`
- 保持内置 `adapter` 继续从安装包目录加载，不改变官方资产加载路径
- 补充目录解析测试，覆盖“包内 adapters + 用户目录运行时状态”的正式边界

## Verification

- `npm test -- tests/unit/shared/constants.test.ts`
- `npm test -- tests/unit/cli/system-commands.test.ts`
- `npm run typecheck`
- `npm test`

## Impact

- 对外命令面不变
- 不引入新的 adapter 机制
- 只修复全局安装时的运行时目录落点
