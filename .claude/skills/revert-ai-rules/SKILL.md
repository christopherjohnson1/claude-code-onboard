---
name: revert-ai-rules
description: Reverts a prior /adopt-ai-rules adoption by restoring precisely from a backup snapshot. Use when a user wants to undo an AI-rules adoption, roll back the .claude/ config standard, or restore files an adoption changed. Works from the backup manifest alone and is fully git-independent.
effort: xhigh
---

# Revert AI Rules

Undoes a `/adopt-ai-rules` run by replaying its backup manifest in reverse. It restores
exactly what that adoption created, modified, or deleted — nothing else — using only the
snapshot under `.claude/.adopt-backups/`. This is **git-independent**: it never inspects
or relies on version-control state, so it works even in repos that aren't using git or
that have unrelated uncommitted changes.

Scripts run via `node "${CLAUDE_SKILL_DIR}/scripts/<name>.mjs"`. They use only `node:fs`
and `node:path` — zero npm dependencies, cross-platform. They read the exact
`manifest.json` shape written by the adopter's `backup.mjs` (identical field names).

## Workflow (§6.6)

### 1. List snapshots

Show every adoption backup, newest first, with a one-glance summary:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/list-backups.mjs" "$CLAUDE_PROJECT_DIR"
```

Each entry prints its timestamp (the value you pass to restore), `mode`, operation count,
`pluginVersion`, and `createdAt`. Ask the user which snapshot to revert if more than one
exists.

### 2. Restore precisely from the chosen manifest

```bash
node "${CLAUDE_SKILL_DIR}/scripts/restore.mjs" "<timestamp>" "$CLAUDE_PROJECT_DIR"
```

`restore.mjs` reads `.claude/.adopt-backups/<timestamp>/manifest.json` and replays its
`operations` array in **reverse order**:

- `op: "create"` → the adoption added the file, so it is **deleted**.
- `op: "modify"` → the adoption overwrote the file, so the verbatim pre-adoption copy is
  **restored** from `backupPath` (`files/<rel>`).
- `op: "delete"` → the adoption removed the file, so it is **restored** from `backupPath`.

After replaying operations it prunes directories the adoption introduced that are now
empty, and appends every action to `revert.log` inside the snapshot. The full action log
is also printed to stdout.

### 3. Report

Summarize what was restored or removed (from the printed log) and confirm the repo is back
to its pre-adoption state. The snapshot directory is left in place (with the updated
`revert.log`) for audit; the user can delete `.claude/.adopt-backups/<timestamp>/`
manually if no longer needed.
