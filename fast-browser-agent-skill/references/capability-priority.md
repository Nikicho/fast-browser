# Capability Priority

Always choose the highest reusable layer that already exists.

## Priority Order

1. `fast-browser case run <site>/<case>`
2. `fast-browser flow run <site>/<flow> --input '{...}'`
3. `fast-browser site <site>/<command> --key value`
4. low-level browser commands

## Decision Rules

Use `case` when:
- the task is already modeled as validation or smoke coverage
- the expected result is already encoded as assertions
- the job is ?run a test scenario?, not ?discover the site?

Use `flow` when:
- the task is a repeated multi-step website workflow
- the task is meaningful as one named goal
- the task should be reusable outside a single test case

Use `site` when:
- a stable atomic adapter command already exists
- the task is basically one site capability call
- the task should not depend on page-level exploration

Use low-level commands when:
- no suitable `case`, `flow`, or `site` command exists
- you are debugging, logging in, or discovering DOM behavior
- you are bridging a one-off gap before summarization

## Required Preflight

Before using low-level commands on an existing site, gather inventory:

```bash
pwsh ./scripts/site-inventory.ps1 -Site <site>
```

If an existing asset is close but not exact, prefer extending it over starting from scratch.
