# Runtime Stability Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two high-impact runtime issues that affect many modern sites: stale snapshot refs after saving state, and brittle click behavior when frontend state changes cause transient runtime errors.

**Architecture:** Keep the scope inside the browser runtime. Add regression tests around `BrowserRuntimeFacade` so the failures are reproducible without a live browser, then make the smallest changes needed in runtime state handling and click recovery.

**Tech Stack:** TypeScript, Vitest, Puppeteer runtime facade

---

### Task 1: Add regression tests for runtime state and click recovery

**Files:**
- Create: `tests/unit/runtime/browser-runtime.test.ts`
- Modify: `src/runtime/browser-runtime.ts`

- [ ] **Step 1: Write a failing test for snapshot ref persistence**

Add a test that runs `BrowserRuntimeFacade.snapshot()` with a stub page and an existing stale `state.refs`, then assert the saved browser state contains the new refs from the latest snapshot.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/runtime/browser-runtime.test.ts`
Expected: FAIL because the saved state still contains stale refs.

- [ ] **Step 3: Write a failing test for transient click recovery**

Add a test that runs `BrowserRuntimeFacade.click()` with a stub page whose first `page.click()` throws a transient runtime error and whose second click succeeds, then assert the runtime retries the action instead of returning early.

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- tests/unit/runtime/browser-runtime.test.ts`
Expected: FAIL because the runtime stops after the transient error instead of retrying.

### Task 2: Fix snapshot state persistence

**Files:**
- Modify: `src/runtime/browser-runtime.ts`
- Test: `tests/unit/runtime/browser-runtime.test.ts`

- [ ] **Step 1: Update snapshot state handling**

Mutate the in-memory `state.refs` before returning from `snapshot()` so the later `saveState()` call persists the latest refs instead of re-writing stale refs from the earlier state snapshot.

- [ ] **Step 2: Run the targeted test**

Run: `npm test -- tests/unit/runtime/browser-runtime.test.ts`
Expected: The snapshot persistence test passes.

### Task 3: Fix transient click recovery

**Files:**
- Modify: `src/runtime/browser-runtime.ts`
- Test: `tests/unit/runtime/browser-runtime.test.ts`

- [ ] **Step 1: Retry click after transient runtime errors**

Refactor click execution so transient runtime errors wait for page readiness and then retry the click path instead of returning success immediately.

- [ ] **Step 2: Keep DOM-click fallback intact**

Preserve the existing fallback for non-transient native click failures after the transient retry path.

- [ ] **Step 3: Run the targeted test**

Run: `npm test -- tests/unit/runtime/browser-runtime.test.ts`
Expected: Both runtime regression tests pass.

### Task 4: Verify full regression safety

**Files:**
- Test: `tests/unit/runtime/browser-runtime.test.ts`
- Test: `tests/unit/runtime/snapshot.test.ts`

- [ ] **Step 1: Run focused runtime tests**

Run: `npm test -- tests/unit/runtime/browser-runtime.test.ts tests/unit/runtime/snapshot.test.ts`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS