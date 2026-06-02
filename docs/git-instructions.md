# Git etiquette

Imported into project memory via `@docs/git-instructions.md` in `CLAUDE.md`.
These are advisory conventions; the deterministic guardrails (e.g. blocking
`git push` to ask, denying secret reads) live in `.claude/settings.json` and
`.claude/hooks/`.

## Before committing

- Run `npm test` and make sure it passes. Do not commit a red build.
- Run `npm run typecheck` and `npm run lint` for anything non-trivial.
- Review your own diff (`git diff --staged`) before writing the message.

## Commit messages — Conventional Commits

Format: `<type>(<optional scope>): <subject>`

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`,
  `ci`, `perf`.
- Subject in the imperative mood, lower-case, no trailing period, ≤ 72 chars.
- Add a body when the "why" isn't obvious from the subject.

Examples:

```
feat(api): add getUser lookup by id
fix(format): handle non-finite cents in formatCurrency
docs: explain the protect-files hook
```

## Branches

- Branch off the default branch for every change; never commit directly to it.
- Name branches `<type>/<short-description>`, e.g. `feat/user-lookup` or
  `fix/format-nan`.
- Keep each commit focused on a single logical change. Prefer several small,
  reviewable commits over one large one.

## Hard rules

- **Never force-push** the default branch (`main`). Force-push only your own
  feature branches, and only when you understand why.
- Don't rewrite published history that others may have pulled.
- Keep secrets out of commits. `.env` and friends are gitignored for a reason.
