# CLAUDE.md

> **Advisory context.** Deterministic rules live in hooks (`.claude/hooks/`).
> This file shapes behavior; it does not enforce it. Anything that must happen
> every time with zero exceptions belongs in a `PreToolUse` hook, not here.

<!-- maintainer note: keep this file under ~200 lines. HTML comments are stripped before
     CLAUDE.md reaches the model, so they cost zero context tokens — use them freely for
     notes to humans, never for instructions to Claude. -->

This is an exemplary repository: a small TypeScript/Node app wrapped in a complete,
current Claude Code configuration. Treat the layered model below as the lesson —
least-powerful mechanism that guarantees the behavior, escalating only when needed.

See @README.md for the full project overview and the layered-enforcement walkthrough.
See @package.json for the authoritative list of npm scripts.

## Commands

Use npm. The canonical scripts (defined in `package.json`, imported above) are:

- `npm run lint` — eslint over `src/` and `tests/`.
- `npm run test` — vitest run (closes the verification loop; see `tests/`).
- `npm run typecheck` — `tsc --noEmit`, strict.
- `npm run format` — prettier `--write` across the repo.

## Code style

- 2-space indentation. No tabs.
- **Named exports only** — no default exports.
- Prettier owns formatting; do not hand-format. The `format-on-edit` hook runs
  `prettier --write` on every edited file, so style drift is corrected automatically.
- TypeScript is `strict`. Prefer explicit, typed return values over inference at
  module boundaries.

The full set of conventions lives in `.claude/rules/code-style.md` (a modular
companion to this file, always loaded). API-specific conventions live in
`.claude/rules/api.md`, which loads only when you touch files under `src/api/`.

## Project layout

- API handlers live in `src/api/handlers/` — one named-export handler per concern.
- Shared utilities live in `src/lib/` (e.g. `src/lib/format.ts`).
- The entry point is `src/index.ts`.
- Tests live in `tests/` and mirror the unit under test (e.g. `tests/format.test.ts`).
- Database migrations live in `migrations/` — **protected**: a `PreToolUse` hook
  blocks edits to that directory, so propose schema changes as new files, reviewed
  by a human.

## Etiquette

- Run `npm test` before committing. The repo ships a `/commit` skill that reviews the
  diff and drafts a Conventional-Commits message — it prints the exact `git commit`
  command rather than running it, so you stay in control.
- Follow the team git conventions in @docs/git-instructions.md.
- Prefer the `/fix-issue` and `/api-handler` skills over ad-hoc work; they encode the
  expected workflow.

## Gotchas

- **CLAUDE.md is advice, not enforcement.** If something must be guaranteed, it is (or
  should be) a hook. Do not assume an instruction here will always be honored.
- **Secrets never go in committed files.** `.env*` is denied by `settings.json` and
  protected by the `protect-files` hook. MCP/config use `${ENV}` expansion only —
  see `.mcp.json.example`.
- **The format hook is cosmetic and cannot be undone** — it rewrites the file you just
  edited. That is intended; just expect your file to come back prettier-formatted.
- **`Edit|Write` hooks do not catch file writes performed via the Bash tool** (e.g.
  `echo > file`). Use the proper Edit/Write tools so the guardrails apply.
- **Permission syntax is space-sensitive:** `Bash(npm run test:*)` is not the same as
  `Bash(npm run test*)`. See the README permissions section before editing
  `settings.json`.
- **`settings.json` is not inherited like `CLAUDE.md`.** A root `.claude/settings.json` —
  its permission denies and its `$CLAUDE_PROJECT_DIR`-wired hooks — applies only when Claude
  is started from the repo root. In a monorepo, launching inside a package silently drops
  those guards; start from the root or use managed settings. See the README's
  "Large codebases & monorepos" section.
