# Flow 交互 Builtins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `flow` 增加 `tabNew/tabSwitch/click/fill/press` 内建步骤，并让 `trace -> flow` 在多 tab 与交互场景下生成正确语义或明确拒绝。

**Architecture:** 扩展 `FlowBuiltinStep` 的命令集合和参数类型，运行时在 `flow-service` 中直接复用现有 router/runtime 能力执行新 builtins。`trace -> flow` 生成逻辑在 `command-router` 中把运行时事件转换成稳定 DSL；无法转换时抛出明确错误，避免生成错误 flow。

**Tech Stack:** TypeScript, Vitest, Fast-Browser CLI/runtime

---

### Task 1: 扩展 Flow 类型与基础校验

**Files:**
- Modify: `D:\AIWorks\skills\fast-browser\src\shared\types.ts`
- Modify: `D:\AIWorks\skills\fast-browser\src\flow\flow-service.ts`
- Test: `D:\AIWorks\skills\fast-browser\tests\unit\flow\flow-service.test.ts`

- [ ] **Step 1: 写 failing tests，覆盖新 builtin 类型和非法参数**
- [ ] **Step 2: 跑对应测试，确认失败**
- [ ] **Step 3: 在 types 中加入 `tabNew/tabSwitch/click/fill/press` 结构**
- [ ] **Step 4: 在 flow 校验中加入组合键和 target 校验**
- [ ] **Step 5: 重跑测试，确认通过**

### Task 2: 在 Flow Runtime 中执行新 Builtins

**Files:**
- Modify: `D:\AIWorks\skills\fast-browser\src\flow\flow-service.ts`
- Test: `D:\AIWorks\skills\fast-browser\tests\unit\flow\flow-service.test.ts`

- [ ] **Step 1: 写 failing tests，覆盖 `tabNew/tabSwitch/click/fill/press` 执行**
- [ ] **Step 2: 跑测试，确认失败**
- [ ] **Step 3: 在 flow 执行器中把新 builtins 映射到 router/runtime**
- [ ] **Step 4: 对 `press` 加入最多两键限制**
- [ ] **Step 5: 重跑测试，确认通过**

### Task 3: 扩展 Trace -> Flow Draft 生成逻辑

**Files:**
- Modify: `D:\AIWorks\skills\fast-browser\src\core\trace-distill.ts`
- Modify: `D:\AIWorks\skills\fast-browser\src\core\command-router.ts`
- Test: `D:\AIWorks\skills\fast-browser\tests\unit\core\command-router.test.ts`

- [ ] **Step 1: 写 failing tests，覆盖知乎/哔哩哔哩多 tab 场景 draft 生成**
- [ ] **Step 2: 写 failing tests，覆盖无法稳定 target 时明确拒绝**
- [ ] **Step 3: 跑测试，确认失败**
- [ ] **Step 4: 扩展 trace draft 允许集合与转换逻辑**
- [ ] **Step 5: 把真实 tabId 转成 `previous/lastCreated`**
- [ ] **Step 6: 对 `click/fill/press` 只接受稳定 target，否则报错**
- [ ] **Step 7: 重跑测试，确认通过**

### Task 4: CLI 与文档收口

**Files:**
- Modify: `D:\AIWorks\skills\fast-browser\README.md`
- Modify: `D:\AIWorks\skills\fast-browser\fast-browser-agent-skill\SKILL.md`
- Modify: `D:\AIWorks\skills\fast-browser\fast-browser-agent-skill\references\agent-workflow.md`
- Modify: `D:\AIWorks\skills\fast-browser\fast-browser-agent-skill\references\browser-recipes.md`

- [ ] **Step 1: 更新 README 的 flow builtin 与 trace draft 说明**
- [ ] **Step 2: 更新 skill，写清交互步骤进入 flow 的边界**
- [ ] **Step 3: 同步到安装目录**

### Task 5: 全量验证

**Files:**
- Verify only

- [ ] **Step 1: 运行定向测试**
  - `npm test -- tests/unit/flow/flow-service.test.ts tests/unit/core/command-router.test.ts`
- [ ] **Step 2: 运行 `npm run typecheck`**
- [ ] **Step 3: 运行 `npm test`**
- [ ] **Step 4: 记录结果并准备下一轮真实站点复测**
