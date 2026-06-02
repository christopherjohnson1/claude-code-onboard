---
name: fix-issue
description: Fixes a GitHub issue end to end given its number — fetches the issue with `gh`, implements the change, then stages and commits it. Use when the user says "fix issue 123", "work on issue #123", "resolve this issue", or hands you a GitHub issue number to address.
argument-hint: "[issue-number]"
allowed-tools:
  ["Bash(gh issue view:*)", "Bash(git add:*)", "Bash(git commit:*)"]
---

# Fix a GitHub issue

Resolve GitHub issue **#$ARGUMENTS** in this repository.

The issue body is fetched and injected below at prompt-expansion time so you
have the full context before doing anything:

!`gh issue view $ARGUMENTS`

## How this skill works

This is a worked example of two distinct argument mechanisms:

- `$ARGUMENTS` — the literal text the user passed after `/fix-issue` (here, the
  issue number). It is substituted into this prompt verbatim.
- `` !`gh issue view $ARGUMENTS` `` — a **preprocessing injection**. The backtick
  prefixed with `!` runs the command _before_ the model reads the prompt and
  splices its stdout into the message. That is why the issue title, body, and
  labels already appear above — you did not have to fetch them yourself.

`allowed-tools` is scoped to exactly the commands this workflow needs
(`gh issue view`, `git add`, `git commit`), so the skill cannot reach for
anything broader. This is the least-powerful-mechanism principle applied to a
skill's tool surface.

## Steps

1. **Understand the issue.** Read the injected `gh issue view $ARGUMENTS`
   output above. Identify the concrete change being requested and the
   acceptance criteria. If the issue is ambiguous, ask the user before writing
   code.
2. **Locate the relevant code.** Find the files that need to change. Keep the
   change as small as the issue requires — no opportunistic refactors.
3. **Implement the fix.** Follow the project's code style (2-space indent,
   named exports, strict TypeScript). API handlers belong in
   `src/api/handlers/`.
4. **Verify.** Run `npm test` and `npm run typecheck` before committing. Do not
   commit a change that breaks the verification loop.
5. **Stage and commit.** Stage the touched files with `git add`, then commit
   with a Conventional Commits message that references the issue, e.g.:

   ```
   git commit -m "fix: <summary> (#$ARGUMENTS)"
   ```

This skill is **non-destructive**: it only fetches issue text, stages files you
changed, and records a commit. It never force-pushes, rebases, or deletes work.
