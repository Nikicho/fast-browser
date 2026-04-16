---
name: fast-browser-agent
description: Use when a task needs the local fast-browser CLI to operate a real website, reuse or create site/flow/case assets, or run browser-based frontend regression checks.
---

# Fast-Browser Agent

## What This Skill Is

Use this skill when the task needs `fast-browser` to drive a real browser, reuse existing browser assets, or promote a successful path into reusable Fast-Browser assets.

Fast-Browser has one core job:

- help the agent reach real websites faster and more reliably

Frontend testing and regression are built on top of that same capability system. They are not a separate product surface.

## Default Operating Mode

Always prefer the highest reusable layer that already exists:

1. `case run`
2. `flow run`
3. `site <adapter>/<command>`
4. low-level browser commands

Treat `console`, `network`, `screenshot`, and raw trace as the diagnostic layer. They explain failures. They are not the human-facing default path.

## What The Agent Does Automatically

Do these without pushing the implementation details onto the user:

- preflight and asset inventory
- `auth sync` after human login is complete
- `trace current --json` before promotion
- rerun saved `site / flow / case` assets after promotion
- collect failure evidence for browser-based regression failures

Minimum preflight:

```bash
fast-browser health
fast-browser workspace --json
fast-browser browser status --json
fast-browser list
```

If the task targets an existing site, also inspect:

```bash
fast-browser info <site> --json
fast-browser info <site>/<command> --json
```

## What The Agent Must Ask The User

Do not guess these:

- whether manual login is needed
- whether opening a `--headed` browser is allowed
- whether the task should hold a stable `--session-id`
- whether a successful path should be promoted into `command / flow / case`
- for frontend testing tasks, what the user path and acceptance criteria are if they are still underspecified

Do not tell the user to do technical follow-up work that the agent should own, such as:

- `auth sync`
- session wiring
- selector debugging
- `console` or `network` triage as the default next step

## Task Routes

### Route 1: Existing Capability

If the site already has reusable assets, do not re-explore by default.

Expected route:

1. inventory existing `case / flow / site`
2. run the highest reusable layer
3. only fall back if the higher layer is missing or clearly insufficient

Load these references when needed:

- [references/capability-priority.md](references/capability-priority.md)
- [references/browser-recipes.md](references/browser-recipes.md)

### Route 2: Frontend Testing And Regression

If the task is really “define a test path” or “run a regression check”, the working order is:

1. check for reusable `case / flow / site`
2. if missing, align with the user on path and assertions
3. run `case` first
4. if no stable `case` exists yet, run `flow`
5. only on failure, enter diagnostics
6. if the path will be reused, promote the result into formal assets

For details, load:

- [references/frontend-testing.md](references/frontend-testing.md)
- [references/capability-priority.md](references/capability-priority.md)
- [references/browser-recipes.md](references/browser-recipes.md)

### Route 3: New Site Bootstrap

If the site has no useful capability yet:

1. choose the most stable direct entry route first
2. use `guide` to create a starter
3. complete at least one real task
4. promote from `trace current --json`

For details, load:

- [references/new-site-bootstrap.md](references/new-site-bootstrap.md)
- [references/storage-location.md](references/storage-location.md)
- [references/promotion-rules.md](references/promotion-rules.md)

## Hard Rules

- If manual login is required, open the right `--headed` window first, wait for the user to finish, then do `auth sync` yourself.
- If multi-stage work or login inheritance matters, use one stable `--session-id` for the whole task.
- Save formal assets to the active Fast-Browser workspace, never to the skill directory.
- Do not save raw `snapshot` refs, one-off selectors, or real `tabId` values into formal `flow` or `case` assets.
- Do not rely on chat memory when `trace current --json` is available.

## Reference Map

Priority and task selection:

- [references/capability-priority.md](references/capability-priority.md)

Frontend testing and failure handling:

- [references/frontend-testing.md](references/frontend-testing.md)
- [references/browser-recipes.md](references/browser-recipes.md)

New site bootstrap and save location:

- [references/new-site-bootstrap.md](references/new-site-bootstrap.md)
- [references/storage-location.md](references/storage-location.md)

Promotion and trace-driven asset building:

- [references/promotion-rules.md](references/promotion-rules.md)
- [references/trace-to-command.md](references/trace-to-command.md)
- [references/trace-to-flow.md](references/trace-to-flow.md)
- [references/trace-to-case.md](references/trace-to-case.md)
