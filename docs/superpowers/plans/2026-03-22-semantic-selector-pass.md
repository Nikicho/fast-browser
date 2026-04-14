# Semantic Selector Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make snapshot refs prefer stable semantic selectors before falling back to structural paths.

**Architecture:** Extract selector generation into a small, testable runtime helper. Rank semantic selector candidates, keep the first unique candidate, and preserve structural path generation as the final fallback.

**Tech Stack:** TypeScript, Vitest, Puppeteer runtime facade

---

### Task 1: Add selector-generation regression tests

**Files:**
- Create: `tests/unit/runtime/selector-generation.test.ts`
- Modify: `src/runtime/snapshot.ts`

- [ ] **Step 1: Write a failing test for semantic selector preference**
- [ ] **Step 2: Run the test to verify it fails**
Run: `npm test -- tests/unit/runtime/selector-generation.test.ts`
Expected: FAIL because selector generation still falls back to structural output.

- [ ] **Step 3: Write a failing test for structural fallback**
- [ ] **Step 4: Run the test to verify it fails**
Run: `npm test -- tests/unit/runtime/selector-generation.test.ts`
Expected: FAIL because the helper does not yet expose the fallback behavior.

### Task 2: Implement selector ranking and fallback

**Files:**
- Modify: `src/runtime/snapshot.ts`
- Modify: `src/runtime/browser-runtime.ts`
- Test: `tests/unit/runtime/selector-generation.test.ts`

- [ ] **Step 1: Add a small selector helper**
- [ ] **Step 2: Prefer semantic candidates with uniqueness checks**
- [ ] **Step 3: Keep structural path generation as the final fallback**
- [ ] **Step 4: Run focused tests and make them pass**
Run: `npm test -- tests/unit/runtime/selector-generation.test.ts tests/unit/runtime/snapshot.test.ts`
Expected: PASS

### Task 3: Verify regression safety

**Files:**
- Test: `tests/unit/runtime/selector-generation.test.ts`
- Test: `tests/unit/runtime/browser-runtime.test.ts`

- [ ] **Step 1: Run focused runtime tests**
Run: `npm test -- tests/unit/runtime/selector-generation.test.ts tests/unit/runtime/browser-runtime.test.ts tests/unit/runtime/snapshot.test.ts`
Expected: PASS

- [ ] **Step 2: Run typecheck**
Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run full test suite**
Run: `npm test`
Expected: PASS