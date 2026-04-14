# Scheme 3 Runtime And Asset Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收齐 P1/P2 的通用底座能力：增强 flow/case 保存校验，并补通 gate、collect、extract、tab 这批浏览器中层命令。

**Architecture:** 先在 flow/case service 里做保存前结构与引用校验，避免写入无效资产；再在 browser runtime 上增加通用页面处理与多 tab 能力，通过 command router 和 browser CLI 暴露。文档和 skill 最后统一跟进，避免规则和实现再次漂移。

**Tech Stack:** TypeScript, Vitest, Commander, Puppeteer/CDP

---

### Task 1: Flow/Case 保存前强校验

**Files:**
- Modify: `src/flow/flow-service.ts`
- Modify: `src/case/case-service.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/flow/flow-service.test.ts`
- Test: `tests/unit/case/case-service.test.ts`

- [ ] 写 flow/case 红灯测试：文件名与 id 不一致、case 引用缺失 flow、flow site step 跨 site、flow/case 禁止 snapshot 语义污染。
- [ ] 运行聚焦测试，确认按预期失败。
- [ ] 实现 flow/case 保存前校验与辅助文件存在性检查。
- [ ] 重新运行聚焦测试并补必要重构。

### Task 2: 浏览器中层能力 MVP

**Files:**
- Modify: `src/runtime/browser-runtime.ts`
- Modify: `src/core/command-router.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/cli/commands/browser.ts`
- Test: `tests/unit/runtime/browser-runtime.test.ts`
- Test: `tests/unit/cli/browser-commands.test.ts`

- [ ] 写红灯测试：gate 处理、collect 长列表、extract blocks、tab list/new/switch/close。
- [ ] 运行聚焦测试，确认失败原因正确。
- [ ] 在 runtime 实现对应能力，并通过 router/CLI 暴露。
- [ ] 重新运行聚焦测试并补边界处理。

### Task 3: 文档与 Skill 同步

**Files:**
- Modify: `README.md`
- Modify: `fast-browser-prd.md`
- Modify: `fast-browser-agent-skill/SKILL.md`
- Modify: `fast-browser-agent-skill/references/*.md`
- Sync: `C:\Users\Hebe1\.codex\skills\fast-browser-agent`
- Sync: `C:\Users\Hebe1\.config\opencode\skills\fast-browser-agent`

- [ ] 更新命令与保存校验文档，明确 flow/case 约束和新浏览器命令。
- [ ] 更新 skill 的默认工作流和禁止事项。
- [ ] 同步到 Codex/OpenCode 安装目录并校验 skill。

### Task 4: 全量验证

**Files:**
- Verify only

- [ ] 运行 `npm run typecheck`。
- [ ] 运行 `npm test`。
- [ ] 运行 skill 校验脚本验证仓库版、Codex 版、OpenCode 版。
