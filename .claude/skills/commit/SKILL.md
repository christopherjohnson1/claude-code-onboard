---
name: commit
description: Drafts a Conventional Commits message from the current staged diff and prints the exact `git commit` command for the user to run. Use when the user types `/commit`, asks "write a commit message", or "draft a commit for these changes". Manual-only; never auto-invoked.
disable-model-invocation: true
---

# Draft a commit message (teaching template — does NOT commit)

> **This is an inert teaching template.** It illustrates the _pattern_ for a
> commit workflow. It **reviews** the diff and **prints** a ready-to-run
> `git commit` command. It **MUST NOT execute the commit itself** — the user
> runs the printed command if and when they want to. Do not call `git commit`,
> `git add`, or any other mutating git command from this skill.

`disable-model-invocation: true` means the model will never trigger this skill
on its own — it stays out of the autonomous tool-selection context and only
runs when the user explicitly types `/commit`. That is the right setting for a
side-effecting-looking workflow you want kept on a manual leash.

## Steps

1. **Review what is staged.** Inspect the diff with read-only commands:

   ```
   git status
   git diff --staged
   ```

   If nothing is staged, tell the user to `git add` their changes first, then
   stop.

2. **Draft a Conventional Commits message.** Use the form:

   ```
   <type>(<optional scope>): <imperative summary, <=72 chars>

   <optional body explaining the "why">
   ```

   Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
   Choose the type from the _nature_ of the staged change (a new export →
   `feat`; a bug correction → `fix`; a test-only change → `test`).

3. **Print the exact command — do not run it.** Output the command in a fenced
   block so the user can copy-paste it. For example:

   ```
   git commit -m "feat(format): add slugify helper" -m "Normalizes titles for URL paths."
   ```

   Then say something like: "Run the command above to commit. I have not
   committed anything."

## Why inert?

This example repo demonstrates patterns without mutating a cloned repo. A real
commit skill could legitimately run `git commit`, but shipping that in an
example would surprise people who clone it to learn. Keeping it inert makes the
teaching intent unambiguous: the skill shows you _how to assemble_ the command,
and leaves the decision to execute with the human.
