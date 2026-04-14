# 2026-03-21 Xiaohongshu Creator Skill Trial

## Goal

Use the `fast-browser-agent` workflow against `https://creator.xiaohongshu.com/` to bootstrap a first adapter for the image-post publish path, including an initial command, flow, and case, then record real trial problems as input for the next iteration.

## Trial Scope

- Site: `creator.xiaohongshu.com`
- Main path: image-post publishing entry
- Login mode: manual login in a headed browser, then verify profile reuse

## Result Summary

What worked:
- Headed browser launch worked.
- Manual login worked.
- Closing and reopening the browser reused the saved login session and returned directly to the logged-in creator home page.
- A starter custom adapter was created under `adapters/xiaohongshu-creator`.
- The initial `flow` and `case` ran successfully in live-browser trials after adjusting the starter assets.

What did not fully work:
- `guide` did not infer the correct page type or command shape for this site.
- Direct `site` command runs were unstable in live trials even when the browser ended up on the correct page.
- Some low-level commands (`snapshot`, `click`, `eval`) were noticeably brittle on this rich frontend.

## Artifacts Created

- `adapters/xiaohongshu-creator/manifest.json`
- `adapters/xiaohongshu-creator/index.ts`
- `adapters/xiaohongshu-creator/commands/enter-image-post-composer.ts`
- `adapters/xiaohongshu-creator/flows/enter-image-post-composer.flow.json`
- `adapters/xiaohongshu-creator/cases/enter-image-post-composer-smoke.case.json`
- `tests/integration/xiaohongshu-creator-trial.test.ts`

## Final Starter Assets

### Command

`xiaohongshu-creator/enter-image-post-composer`

Purpose:
- Open the image composer route directly
- Wait for the upload input to appear
- Return the composer URL, title, and readiness selector

Current tradeoff:
- This first version uses the discovered direct route instead of clicking the home-page card, because the home-page click path was unstable in real trials.

### Flow

`xiaohongshu-creator/enter-image-post-composer`

Purpose:
- Reuse the site command as the first stable multi-step path
- Assert the browser is on `/publish/publish`
- Assert at least one `input.upload-input` exists

### Case

`xiaohongshu-creator/enter-image-post-composer-smoke`

Purpose:
- Smoke-test the starter flow on the logged-in creator platform
- Assert URL, upload input presence, and non-empty title

## Real Trial Findings

### 1. Guide misclassified the logged-in creator home page

Observed:
- `guide inspect` classified the page as `search`
- it suggested a required `query` argument
- it recommended `nps/showstatus` as the command endpoint

Impact:
- The generated command and flow were not useful for the publish-entry use case
- Guide output required manual rewriting before it could become a usable adapter

Recommendation:
- Improve guide heuristics for logged-in app shells and dashboard-style pages
- Reduce over-weighting of background network traffic when choosing `pageKind` and command arguments

### 2. Guide scaffold generated invalid TypeScript for hyphenated command names

Observed:
- The scaffolded files used `enter-image-post-composer` directly as a function identifier and import name
- That output is not valid TypeScript

Impact:
- The generated adapter cannot compile as-is for common command names that contain hyphens

Recommendation:
- Keep manifest command names kebab-case
- Convert generated function identifiers to camelCase in TypeScript source

### 3. Custom adapter discovery silently dropped adapters when `manifest.json` had UTF-8 BOM

Observed:
- The custom adapter existed on disk and `index.ts` could be required manually
- `AdapterRegistry.discover()` still skipped it because `JSON.parse()` failed on BOM-prefixed manifest content
- The registry swallowed the load failure and returned no diagnostic detail

Impact:
- A valid-looking adapter can disappear from discovery without a clear reason

Recommendation:
- Strip BOM before parsing custom `manifest.json`
- Emit visible load diagnostics for skipped custom adapters

### 4. `snapshot` gave no interactive refs on the logged-in creator home page

Observed:
- The page text was captured, but `interactive` came back empty on the main home page
- The page still clearly had actionable publish cards and navigation items

Impact:
- The agent had to fall back to manual DOM probing with `eval`
- This increases exploration cost and weakens the value of `snapshot` on modern app-style pages

Recommendation:
- Improve interactive element extraction for rich frontend layouts and non-semantic clickable containers

### 5. `click` timed out on the publish card even when the target selector was correct

Observed:
- Clicking the discovered publish-card selector produced a `Runtime.callFunctionOn timed out` error
- The selector came from a real DOM probe and matched the visible entry card

Impact:
- Even after discovering the right target, low-level interaction was not reliable enough to promote directly into a command

Recommendation:
- Improve click resilience on dynamic frontend containers
- Add more detailed click diagnostics to distinguish selector miss, stale DOM, blocked interaction, and runtime timeout

### 6. `eval` argument passing is brittle for multi-line or richer expressions

Observed:
- Multi-line `eval` attempts were parsed as too many CLI arguments
- One-line expressions worked more reliably than here-string payloads

Impact:
- The agent had to reshape expressions to fit CLI parsing constraints instead of focusing on the page problem

Recommendation:
- Add a safer raw-script input mode for `eval`
- Or support `--file` / stdin input for longer scripts

### 7. Direct `site` command runs were unstable even when the resulting page state was correct

Observed:
- Several live runs of `fast-browser site xiaohongshu-creator/enter-image-post-composer` returned errors such as:
  - `net::ERR_ABORTED`
  - `Execution context was destroyed, most likely because of a navigation`
  - `Unexpected end of JSON input`
- Despite those failures, later `flow` and `case` runs sometimes succeeded and the browser URL was already correct

Impact:
- Command-level success was not trustworthy enough for agents to depend on directly
- The browser state sometimes advanced farther than the error suggested

Recommendation:
- Improve navigation handling around route changes and DOM reloads
- Stabilize page-state reads immediately after navigations

### 8. Flow success currently does not require every site step to succeed

Observed:
- One live `flow run` returned `ok: true` even though its only site step contained `success: false`
- The flow passed because the final assertions succeeded

Impact:
- A flow can be reported as successful even when its core command reported failure
- This weakens flow semantics and can hide flaky command behavior

Recommendation:
- Decide whether flow success should require both:
  - successful step execution
  - successful end assertions
- At minimum, expose a stronger warning when step results disagree with flow-level success

## Practical Assessment Of The Skill Trial

The `fast-browser-agent` workflow itself was still useful.

It helped in the right order:
- confirm existing capability
- prefer reusable layers
- mark trace boundaries
- use `guide` for cold-start scaffolding
- promote stable knowledge into command/flow/case

The main problems were not with the skill instructions. They were with the current CLI/runtime behavior on a modern logged-in SPA-style site.

## Next Improvement Priorities

1. Fix guide for logged-in app shells and dashboard pages.
2. Fix scaffolded TypeScript identifier generation for kebab-case commands.
3. Strip BOM and surface discovery diagnostics for custom adapters.
4. Make `snapshot` find clickable refs on non-semantic frontend cards.
5. Stabilize `click` and post-navigation command execution.
6. Make `flow` treat failed site steps more strictly.
7. Add a safer transport for long `eval` scripts.
