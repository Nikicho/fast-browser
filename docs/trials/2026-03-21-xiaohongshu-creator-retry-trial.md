# 2026-03-21 Xiaohongshu Creator Retry Trial

## Goal

Re-run the Xiaohongshu creator adaptation after the底座 fixes and verify whether a fresh adapter can be created for the image-post publish path.

## Result Summary

What worked:
- existing browser profile still reused the logged-in creator session
- `guide inspect` no longer misclassified the creator home page as `search`
- direct image-route opening worked: `https://creator.xiaohongshu.com/publish/publish?target=image`
- a new starter adapter, flow, and case were created under `adapters/xiaohongshu-creator`
- live `site` run succeeded
- live `flow run` succeeded on retry
- live `case run` succeeded

## New or Remaining Findings

### 1. `guide plan` is improved, but strategy selection is still noisy

Observed:
- `guide inspect` now returns `pageKind: generic`
- `guide plan` still selected `nps/showstatus` as the network endpoint for the starter command

Impact:
- the generated scaffold is less wrong than before, but still not close to the real publish-entry capability

Recommendation:
- keep reducing the weight of background dashboard endpoints when choosing starter strategies for logged-in app-shell pages

### 2. `guide scaffold` still generated low-quality starter command code for zero-arg network commands

Observed:
- generated command source duplicated `const input = params`
- the scaffolded command still needed manual replacement for this site

Impact:
- scaffold output is compilable now, but not yet clean enough to trust as-is for real adaptation work

Recommendation:
- tighten scaffold templates for zero-arg commands and network starters

### 3. Snapshot refs were visible in output but not reliably reusable afterward

Observed:
- `fast-browser snapshot` on the publish page showed useful refs for `上传图文`
- `click "@e37"` and `click "@e38"` failed because the runtime state still contained stale refs from an older snapshot

Impact:
- agents cannot always trust that a just-returned snapshot ref is immediately reusable

Recommendation:
- verify snapshot-ref persistence in browser state after non-trivial snapshots

### 4. Raw `click` on the publish-mode tabs is still brittle

Observed:
- `click '.header-tabs .creator-tab:nth-child(2)'` and similar selectors timed out
- a one-line DOM `eval` click switched the page mode successfully

Impact:
- low-level `click` is still unreliable on this dynamic tab container even after the底座 pass

Recommendation:
- continue improving click fallback behavior on dynamic frontend tabs and Vue-managed containers

### 5. Flow had one transient standalone failure before succeeding on retry

Observed:
- the first standalone `flow run` returned `Unexpected end of JSON input`
- the immediate retry succeeded with the same browser state and command path

Impact:
- the core path is usable now, but there is still some transient instability around standalone flow execution

Recommendation:
- continue investigating transient JSON/response parsing failures around runtime-driven flow execution

## Final Starter Assets

- `adapters/xiaohongshu-creator/manifest.json`
- `adapters/xiaohongshu-creator/index.ts`
- `adapters/xiaohongshu-creator/commands/enter-image-post-composer.ts`
- `adapters/xiaohongshu-creator/flows/enter-image-post-composer.flow.json`
- `adapters/xiaohongshu-creator/cases/enter-image-post-composer-smoke.case.json`
- `tests/integration/xiaohongshu-creator-adapter.test.ts`

## Practical Assessment

The adapted starter path is now good enough for real use:
- it does not rely on the creator home page card
- it opens the image composer directly
- it verifies the upload input accepts image formats
- it already has a reusable `command -> flow -> case` chain

The remaining problems are mostly runtime/scaffold quality issues, not blockers for this specific starter path.
