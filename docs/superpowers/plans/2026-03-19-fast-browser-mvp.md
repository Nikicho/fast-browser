# Fast-Browser MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Fast-Browser MVP described in the PRD: a TypeScript CLI with adapter discovery/execution, three built-in adapters, LRU+TTL cache management, and a guide command that scaffolds a new adapter.

**Architecture:** Keep the core small and typed. The CLI parses commands into a router, the router delegates to adapter/cache/guide services, and adapters run behind one contract with uniform result and error shapes. For MVP, the browser runtime remains a lightweight facade around network/document inspection rather than a full persistent browser engine.

**Tech Stack:** TypeScript, Commander, Zod, Pino, Cheerio, Inquirer, Vitest

---

### Task 1: Project Skeleton And Shared Contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `README.md`
- Create: `src/index.ts`
- Create: `src/shared/types.ts`
- Create: `src/shared/errors.ts`
- Create: `src/shared/constants.ts`
- Create: `src/shared/logger.ts`
- Create: `src/core/result.ts`
- Create: `tests/unit/shared/errors.test.ts`

- [ ] **Step 1: Write the failing shared-behavior tests**
- [ ] **Step 2: Run the tests and confirm failure**
- [ ] **Step 3: Add package metadata, scripts, and TypeScript config**
- [ ] **Step 4: Implement shared types, error helpers, and result helpers**
- [ ] **Step 5: Re-run the shared tests and keep them green**

### Task 2: Cache, Registry, And Adapter Execution Core

**Files:**
- Create: `src/cache/cache-store.ts`
- Create: `src/cache/cache-key.ts`
- Create: `src/cache/memory-lru-ttl-cache.ts`
- Create: `src/core/adapter-registry.ts`
- Create: `src/core/adapter-manager.ts`
- Create: `src/core/command-router.ts`
- Create: `src/runtime/browser-runtime.ts`
- Create: `src/runtime/session-store.ts`
- Create: `tests/unit/cache/memory-lru-ttl-cache.test.ts`
- Create: `tests/unit/core/adapter-manager.test.ts`

- [ ] **Step 1: Write failing cache and adapter-manager tests**
- [ ] **Step 2: Run the targeted tests and confirm failure**
- [ ] **Step 3: Implement the cache contract and LRU+TTL behavior**
- [ ] **Step 4: Implement adapter discovery, manifest validation, and execution flow**
- [ ] **Step 5: Re-run the targeted tests until green**

### Task 3: CLI Commands And Built-In Adapters

**Files:**
- Create: `src/cli/parser.ts`
- Create: `src/cli/commands/site.ts`
- Create: `src/cli/commands/list.ts`
- Create: `src/cli/commands/info.ts`
- Create: `src/cli/commands/health.ts`
- Create: `src/cli/commands/cache.ts`
- Create: `src/cli/commands/guide.ts`
- Create: `src/cli/commands/test.ts`
- Create: `src/adapters/github/index.ts`
- Create: `src/adapters/google/index.ts`
- Create: `src/adapters/wikipedia/index.ts`
- Create: `tests/unit/cli/parser.test.ts`
- Create: `tests/integration/site-commands.test.ts`

- [ ] **Step 1: Write failing CLI and adapter integration tests**
- [ ] **Step 2: Run the targeted tests and confirm failure**
- [ ] **Step 3: Implement CLI parsing and command routing**
- [ ] **Step 4: Implement GitHub search, Google search, and Wikipedia page adapters**
- [ ] **Step 5: Re-run the targeted tests and keep them green**

### Task 4: Guide MVP And Documentation

**Files:**
- Create: `src/guide/guide-service.ts`
- Create: `src/guide/steps/collect-meta.ts`
- Create: `src/guide/steps/inspect-site.ts`
- Create: `src/guide/steps/choose-strategy.ts`
- Create: `src/guide/steps/scaffold-files.ts`
- Create: `src/guide/steps/run-smoke-test.ts`
- Create: `docs/PRD.md`
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/ADAPTER_GUIDE.md`
- Create: `tests/unit/guide/guide-service.test.ts`

- [ ] **Step 1: Write the failing guide-service tests**
- [ ] **Step 2: Run the guide tests and confirm failure**
- [ ] **Step 3: Implement the interactive guide scaffolding flow**
- [ ] **Step 4: Add developer-facing documentation**
- [ ] **Step 5: Re-run guide tests and verify generated output shape**

### Task 5: End-To-End Verification

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `tests/integration/site-commands.test.ts`

- [ ] **Step 1: Install dependencies**
- [ ] **Step 2: Run the test suite**
- [ ] **Step 3: Run representative CLI commands**
- [ ] **Step 4: Document any runtime gaps that remain outside MVP**
