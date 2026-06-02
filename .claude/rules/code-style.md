# Code style

<!-- No `paths:` frontmatter on this file. Per the live docs, a rule without a `paths`
     field is loaded unconditionally at launch with the same priority as .claude/CLAUDE.md,
     so these conventions are always in context. This is the modular companion to CLAUDE.md;
     api.md is the path-scoped counterpart. -->

These conventions are always loaded (no `paths:` frontmatter). They are the modular
companion to `CLAUDE.md` and apply to all TypeScript in this repo.

## Formatting

- 2-space indentation. No tabs, anywhere.
- Prettier is the single source of truth for formatting. Do not hand-format code to
  match a personal preference — run `npm run format`, or rely on the `format-on-edit`
  hook, which runs `prettier --write` on every file you edit.
- Keep lines readable; let Prettier wrap. Do not fight its output.

## Modules and exports

- **Named exports only.** Do not use `export default`.
  - Yes: `export function formatUser(...) { ... }`
  - No: `export default function (...) { ... }`
- One responsibility per file. Co-locate a thing with its closest peers
  (`src/lib/format.ts`, `src/api/handlers/users.ts`).
- Import what you use; avoid wildcard re-exports that obscure where a symbol lives.

## Types

- TypeScript runs in `strict` mode (`tsconfig.json`). Honor it — no `any` escape hatches
  to silence the checker.
- Give exported functions explicit, typed return values. Inference is fine for locals;
  module boundaries should be self-documenting.
- Prefer precise types (unions, literals) over broad ones.

## Testing

- Tests use **vitest** and live in `tests/`, mirroring the unit under test
  (e.g. `tests/format.test.ts` covers `src/lib/format.ts`).
- Run `npm run test` before committing — this is the verification loop.
- Write a test alongside any new exported function; cover the behavior, not the
  implementation detail.

## Linting

- `npm run lint` runs eslint. The format hook fixes style silently; lint surfaces
  correctness/convention issues and does **not** block the turn (a blocking variant is
  documented in the README). Treat lint warnings as work to finish, not noise to ignore.
