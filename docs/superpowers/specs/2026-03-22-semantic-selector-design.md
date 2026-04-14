# Semantic-First Selector Design

**Problem:** Snapshot refs currently depend too often on structural `nth-of-type` selectors. On modern, dynamic pages this produces fragile refs that break quickly and force agents back to repeated `snapshot` or `eval` loops.

**Goal:** Make snapshot selector generation prefer stable semantic anchors before structural fallbacks, without changing the CLI contract or introducing a new ref format.

## Scope

In scope:
- improve selector generation inside the snapshot evaluator
- prefer unique semantic selectors such as `id`, `data-*`, `name`, `aria-label`, `placeholder`, stable classes, and selected element attributes like `href`
- keep `nth-of-type` path generation only as the final fallback
- add regression tests for semantic preference and fallback behavior

Out of scope:
- multi-candidate refs
- text-based selectors or a new locator DSL
- changing adapter / flow / case formats
- guide improvements

## Design

### Option 1: Keep current structural path generation
Pros:
- zero refactor

Cons:
- does not address the main cross-site failure pattern
- keeps refs brittle on SPA pages

### Option 2: Semantic-first selector generation with uniqueness checks
Pros:
- improves ref reuse without changing the public interface
- directly matches the intended “语义优先、结构兜底” model
- still preserves a guaranteed fallback path

Cons:
- requires careful candidate filtering to avoid unstable class names

### Option 3: Store multiple selector candidates per ref
Pros:
- stronger long-term model

Cons:
- larger change to runtime state and ref resolution
- too large for this pass

## Recommendation

Use Option 2. Generate a ranked list of selector candidates for each element, keep the first unique stable selector, and fall back to the existing structural path only when no semantic candidate is usable.

## Testing

Add focused runtime tests that prove:
- a semantic selector is preferred over an `nth-of-type` path when a unique stable candidate exists
- the structural fallback still works when no semantic anchor exists