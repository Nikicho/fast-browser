# Storage Location

Fast-Browser reusable assets do not live inside this skill package.

## Rule

Always distinguish between:
- skill install directory: where this skill is stored for the current coding tool
- Fast-Browser workspace: the directory where `fast-browser` is being run and where reusable assets must be saved

Only the second one matters for adapters, flows, and cases.

## Where assets belong

Save reusable assets into the active Fast-Browser workspace:

```text
<workspace>/src/adapters/<site>/manifest.json
<workspace>/src/adapters/<site>/commands/*.ts
<workspace>/src/adapters/<site>/flows/*.flow.json
<workspace>/src/adapters/<site>/cases/*.case.json
```

Current Fast-Browser CLI behavior resolves custom adapters relative to the active workspace, not relative to the skill directory.

Resolution order:
- `FAST_BROWSER_ROOT` if set
- otherwise the current Fast-Browser CLI package root

## Use the CLI as the source of truth

Before scaffolding or saving anything, run:

```bash
fast-browser workspace --json
```

Read `projectRoot` and `adaptersDir` from that output. Do not infer the save location from the skill path, your editor tab, or a remembered repo path.

## Tool-specific skill dirs are not asset dirs

Different coding tools may install this skill in different places, for example:
- Codex: tool-specific skill directory
- Claude Code: tool-specific skill directory
- OpenCode: `~/.config/opencode/skills`

Those locations are for reading the skill only. Do not scaffold adapters there unless that directory is also the active Fast-Browser workspace.

## Practical check

Before scaffolding or saving:
1. run `fast-browser workspace --json`
2. confirm that `projectRoot` matches the Fast-Browser CLI package you intend to use
3. confirm that `adaptersDir` is where reusable assets should land
4. keep the skill package unchanged except when updating instructions/templates

## Wrong vs right

Wrong:
- saving `src/adapters/<site>` under the skill package because the skill file is open there
- saving `src/adapters/<site>` under some unrelated repo because the browser task notes are open there

Right:
- saving `src/adapters/<site>` under the `adaptersDir` reported by `fast-browser workspace --json`

## Browser profile and browser runtime state

Adapters, flows, and cases are workspace assets.

Browser login state is different:
- Fast-Browser now uses one user-level shared browser profile by default
- default profile dir: `%USERPROFILE%\\.fast-browser\\chrome-profile`
- default browser runtime state file: `%USERPROFILE%\\.fast-browser\\sessions\\browser-state.json`

This means different coding tools can share the same browser login state as long as they run the same installed Fast-Browser CLI on the same machine.

