# Trace To Flow

Use `fast-browser trace current --json` to decide when a successful path should become a new flow.

## Input Rule

Always start from the distilled `trace current` result, not from raw `trace latest` output and not from chat memory.

Read these fields first:
- `status`
- `entries[]`
- `discarded[]`
- `checkpoints[]`
- `entries[].signal`
- `entries[].locator`

## When to Create a Flow

Create a `flow` when the successful path is:
- multi-step
- repeated often
- meaningful as one named goal

Examples:
- search and open first result
- login and open orders
- search product and add first result to cart

## Cleaning Trace Data

Before turning trace data into a flow:
- remove failed branches
- remove retries that were only recovery noise
- keep only the final successful path
- keep only steps necessary for the goal
- prefer already-distilled `trace current.entries[]`; do not rebuild the path from raw markers by hand

## Flow Constraints

Current flow DSL supports:
- `site` steps
- builtin `open`
- builtin `wait`
- builtin `waitForSelector`
- success assertions

Current flow DSL does not support:
- `snapshot`
- `eval`
- `click`
- `fill`
- `type`
- `press`
- `hover`
- `if/else`
- loops
- parallel steps
- rollback

Interpretation rule:
- if a trace step has `flowSafe: true`, it may be represented directly in the saved flow
- if a trace step has `flowSafe: false`, do not put that low-level step into the saved flow
- if a trace step has `commandCandidate: true`, promote it to an adapter command first when it is stable enough
- if a trace step only shows a DOM action but no page-level success signal, prefer promoting a stable `command` instead of preserving the low-level action idea

If trace contains `snapshot`, keep it only as exploration evidence. Do not carry it into the saved `flow` definition.

## Output Form

Save the result as `flows/<name>.flow.json` and validate it with:

```bash
fast-browser flow save --site <site> --file <flow.json>
fast-browser flow list <site>
fast-browser flow run <site>/<flow> --input '{...}'
```

A `flow` is not considered saved unless:
- the JSON file exists under the active workspace
- `flow list` can see it
- `flow run` succeeds
## Acceptance Boundary

If external site-specific tools were used during exploration, the resulting flow is only `exploration-assisted` until the final path is rerun through Fast-Browser itself.
