# Promotion Rules

Fast-Browser gets faster only when successful work is promoted into reusable assets.

## Save-Time Source of Truth

Before creating or updating any `command`, `flow`, or `case`, run:

```bash
fast-browser trace current --json
```

Use that distilled trace as the primary evidence.
Do not rely on chat memory or raw `trace latest` output when `trace current` is available.

When present, inspect:
- `locator.resolvedSelector`
- `locator.selectorCandidates`
- `signal.urlChanged`
- `signal.titleChanged`
- `flowSafe`
- `commandCandidate`

## Promote to Command

Promote a step to adapter `command` when it is:
- stable
- atomic
- site-specific
- parameterizable with a small argument set

Typical examples:
- `github/search`
- `shop/add-to-cart`
- `portal/open-orders`

## Promote to Flow

Promote to `flow` when the task is:
- multi-step
- repeated often
- still meaningful as one named goal

Typical examples:
- search and open first result
- login and open orders
- search product and add first result to cart
- search first, then reuse `${steps[0].data.id}` or `${steps[0].data.url}` in a later step

Current rule:
- if a `site` step returns `success: false`, the flow should be treated as failed immediately
- do not rely on trailing assertions to hide a broken underlying command
- a saved flow must be executable DSL, not a narrative record of browser exploration

## Promote to Case

Promote to `case` when the goal is validation:
- smoke tests
- regression checks
- human-written manual test scenarios mapped into executable flow orchestration

Current rule:
- first version of `case` only composes `flow`
- a saved case must be executable orchestration, not a step diary

## Never Persist

Do not save:
- failed detours
- unstable selectors discovered only once
- exploratory `eval` snippets used only for diagnosis
- noisy retries and backtracking
- steps that only worked because of accidental UI state
- decorative homepage entry clicks when a stable direct route exists
- `snapshot` steps inside saved `flow` or `case` definitions
- raw chat transcripts, scratchpad notes, or agent runtime summaries in place of real saved assets
- external site-specific skill or CLI results used in place of Fast-Browser execution
- any asset claimed as complete without a final Fast-Browser rerun of the successful path

For low-level steps:
- if a step has no meaningful page-level signal and the trace notes warn that it may only be a DOM action, treat it as weak evidence
- if a step only worked once through a transient snapshot ref and offers no reusable selector interpretation, do not promote it directly

## Stability Heuristics

Good candidates usually have:
- clear inputs
- clear success signal
- minimal dependence on one fragile selector
- repeatability across multiple runs
- a stable direct route when the site offers one
- parameter shapes that pass strict `site` validation without relying on ignored extra fields

Bad candidates usually have:
- hidden prerequisite state
- lots of trial-and-error clicks
- temporary DOM selectors that appeared only once
- inline logic that depends on ad-hoc `eval`
- homepage shells or tabs that are less stable than a verified deep link
- flows that silently depend on whichever tab happened to be active instead of an explicitly managed current tab

## Persistence Rule

A `flow` or `case` is not considered saved unless:
- it exists under the active Fast-Browser workspace
- save-time validation passes
- `fast-browser flow list <site>` or `fast-browser case list <site>` can see it
- `run` succeeds