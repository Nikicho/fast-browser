# Session Lifecycle Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ? `session clone` ?????? TTL ???????? `active / idle / expired` ???? CLI cleanup ???

**Architecture:** ???? `browser meta state` ????????? runtime ????? clone ???????? cleanup ??? TTL?????? pin ???? `active`?`idle`?`expired`?

**Tech Stack:** TypeScript, Vitest, Commander, Node.js fs/path

---

### Task 1: ?? lifecycle ????

**Files:**
- Modify: `D:/AIWorks/skills/fast-browser/tests/unit/runtime/browser-runtime.test.ts`

- [ ] **Step 1: ????**
  ???
  - ????????? => `idle`
  - ????????????? => `active`
  - ???? TTL => `expired`

- [ ] **Step 2: ?????**
  Run: `npm test -- tests/unit/runtime/browser-runtime.test.ts`

- [ ] **Step 3: ?? lifecycle ??**
  ? runtime ?? `resolveLifecycle` ???

- [ ] **Step 4: ??????**
  Run: `npm test -- tests/unit/runtime/browser-runtime.test.ts`

### Task 2: ? cleanup ?? refined lifecycle

**Files:**
- Modify: `D:/AIWorks/skills/fast-browser/src/runtime/browser-runtime.ts`
- Modify: `D:/AIWorks/skills/fast-browser/tests/unit/runtime/browser-runtime.test.ts`

- [ ] **Step 1: ????**
  ???
  - running ????? session ?? `active-browser`
  - cleanup ??? `expired`??? `idle`

- [ ] **Step 2: ?????**
  Run: `npm test -- tests/unit/runtime/browser-runtime.test.ts`

- [ ] **Step 3: ?? cleanup ??**
  cleanup ????? refined lifecycle ? `kept.reason`

- [ ] **Step 4: ??????**
  Run: `npm test -- tests/unit/runtime/browser-runtime.test.ts`

### Task 3: ?????????

**Files:**
- Modify: `D:/AIWorks/skills/fast-browser/README.md`
- Modify: `D:/AIWorks/skills/fast-browser/docs/HUMAN_OPERATOR_GUIDE.md`
- Modify: `D:/AIWorks/skills/fast-browser/fast-browser-agent-skill/SKILL.md`

- [ ] **Step 1: ????**
  ???
  - `active` ????????
  - `idle` / `expired` ???
  - `pin` ? cleanup ???

- [ ] **Step 2: ?? skill**
  ?????? Codex / OpenCode ?

- [ ] **Step 3: ????**
  Run: `npm run typecheck`
  Run: `npm test`
