# Workspace Flow Runtime Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the remaining cross-site bottom-up gaps in workspace discovery, flow dynamic bindings, and low-level interaction semantics so adapters and flows stay reusable across complex SPAs.

**Architecture:** Root resolution moves from raw `process.cwd()` to an explicit workspace resolver with environment override and ancestor fallback. Flow templating expands from `params`-only substitution to a scoped execution context that includes prior step results. Runtime interaction methods share a small post-action settling path so key actions behave closer to real business interactions on SPA pages.

**Tech Stack:** TypeScript, Vitest, Commander, Puppeteer Core

---

### Task 1: Workspace resolution

**Files:**
- Modify: `src/shared/constants.ts`
- Create: `tests/unit/shared/constants.test.ts`

- [ ] Add failing tests for env override and ancestor workspace detection.
- [ ] Implement sync workspace resolution with `FAST_BROWSER_ROOT` override and ancestor marker fallback.
- [ ] Run focused constants tests.

### Task 2: Flow dynamic step bindings

**Files:**
- Modify: `src/flow/flow-service.ts`
- Modify: `src/shared/types.ts`
- Modify: `tests/unit/flow/flow-service.test.ts`

- [ ] Add failing tests for `${steps[0].data...}` and `${steps[0].result...}` substitutions.
- [ ] Implement scoped template resolution over params and prior step outputs.
- [ ] Run focused flow tests.

### Task 3: Runtime action semantics

**Files:**
- Modify: `src/runtime/browser-runtime.ts`
- Modify: `tests/unit/runtime/browser-runtime.test.ts`

- [ ] Add failing tests for post-keypress settling and stronger fill semantics.
- [ ] Implement shared post-action settling and React-friendly fill path updates.
- [ ] Run focused runtime tests.

### Task 4: Documentation and skill alignment

**Files:**
- Modify: `README.md`
- Modify: `fast-browser-prd.md`
- Modify: `fast-browser-agent-skill/**`

- [ ] Update docs for workspace resolution, flow step bindings, and CLI example conventions.
- [ ] Sync the skill package to repo, Codex, and OpenCode installs.
- [ ] Run full verification.
