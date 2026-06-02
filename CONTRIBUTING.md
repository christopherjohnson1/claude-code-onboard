# Contributing to claude-code-onboard

Thanks for helping improve the standard. This repo is both a **reference implementation** of
a Claude Code configuration standard and the **adoption engine** that installs it into other
repos — so changes here ripple outward. Please keep it exemplary.

## Prerequisites

- Node.js **≥ 20** (CI tests on 20 and 22).
- Claude Code **≥ 2.1.160** and an xhigh-capable model (Opus 4.7/4.8) to exercise the
  effort/ultracode behaviors (a soft requirement — see the README).

## Setup

```bash
npm install
```

## The verification loop (run before every commit)

```bash
npm run lint        # eslint (flat config; bans default exports)
npm run typecheck   # tsc --noEmit, strict
npm run test        # vitest
npm run format      # prettier --write  (or rely on the format-on-edit hook)
```

CI runs exactly these — plus `prettier --check` — on Node 20 and 22. A change is "done" only
when they pass; that is the loop this repo teaches, so contributions are held to it.

## Conventions

- **Named exports only** — no `export default` (enforced by the lint config).
- **2-space indentation.** Prettier owns formatting — don't hand-format; the `format-on-edit`
  hook rewrites every file you edit.
- **Strict TypeScript** — no `any` escape hatches; give exported functions explicit return
  types.
- Tests live in `tests/`, mirroring the unit under test; add one alongside any new exported
  function.
- Full conventions: [`.claude/rules/code-style.md`](.claude/rules/code-style.md), and for API
  handlers [`.claude/rules/api.md`](.claude/rules/api.md).

## Things the hooks enforce (don't fight them)

- `migrations/` is **append-only history** — never edit an existing migration; add a new
  numbered file (`protect-files.sh` blocks edits).
- `.env*`, `package-lock.json`, `.git/`, and `.claude/.adopt-backups/` are **protected**.
- Use the Edit/Write tools rather than `echo > file` via Bash, so the guardrails actually
  apply (a tool-matcher hook scopes to a tool, not to a filesystem effect).

## Commits & pull requests

- Use **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:` …). The `/commit` skill
  drafts a message from your diff and **prints** the `git commit` command for you to run.
- `main` is protected: open a PR, and the **`ci-success`** check must be green before merge.
- Keep the README honest — if you add, move, or remove a file, update the file-tree
  walkthrough in the same PR.
- Match the layer to the need (the README's "least-powerful mechanism" principle): a
  convention belongs in `CLAUDE.md` / `rules/`, a trust boundary in `settings.json`, a
  must-happen-every-time rule in a hook, an on-demand workflow in a skill.

## Questions

Open a GitHub issue (templates provided) or check the [Claude Code docs](https://code.claude.com/docs).
