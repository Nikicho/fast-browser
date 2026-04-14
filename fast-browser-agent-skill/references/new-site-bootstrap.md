# New Site Bootstrap

Use guide only to create a starter. Do not treat guide output as mature knowledge.

This file lives inside the skill package. Any `references/...` path mentioned by the skill should be resolved relative to the skill package directory, not the active Fast-Browser workspace.

## Before Guide

Confirm the active Fast-Browser workspace first.

Do not scaffold into the skill package directory just because this skill is installed there. New adapters belong under the active workspace used for `fast-browser` commands.

Always read the target save location from the CLI first:

```bash
fast-browser workspace --json
```

If `projectRoot` is not the intended Fast-Browser CLI package root, fix that before scaffolding. Use `FAST_BROWSER_ROOT` only when you need to override the default package-root workspace on purpose.

See [storage-location.md](storage-location.md).

For logged-in dashboards, creator backends, and SPA app shells, identify the most stable entry route first. Prefer a verified deep link over a decorative home card or tab if both lead to the same working area.

## Sequence

```bash
fast-browser workspace --json
fast-browser guide inspect --url <url>
fast-browser guide plan --platform <site> --url <url> --capability "<capability>" --strategy auto --command <command> --ttl-seconds 60
fast-browser guide scaffold --platform <site> --url <url> --capability "<capability>" --strategy auto --command <command> --ttl-seconds 60 --run-test
```

## After Scaffold

Immediately review:
- generated manifest
- generated command source
- generated starter flow
- smoke test result
- actual `rootDir` reported by scaffold output

Then do one real task on the site and summarize what guide could not infer.

Do not replace Fast-Browser validation with an external site-specific tool. If you used one for exploration, rerun the final path with Fast-Browser itself before calling the adapter usable.

If the site is a logged-in app shell, replace noisy dashboard endpoints or decorative entry clicks with the most stable direct route you can verify.

## Guide Boundaries

Guide is for:
- initial adapter skeleton
- inferred command args
- starter flow generation

Guide is not for:
- automatic long-session learning
- keeping failed and successful branches separate
- producing finished production-grade flows without review
