---
name: adopt-ai-rules
description: Installs this Claude Code configuration standard into any codebase, migrating an existing AI-rules setup (Cursor, Copilot, Windsurf, Gemini, Cline, Claude/AGENTS.md) when one is present. Use when a user wants to adopt the standard, migrate AI rules, set up .claude/ config, or onboard a repo to these conventions. Always backs up before writing and is reversible via /revert-ai-rules.
effort: xhigh
---

# Adopt AI Rules

Installs the canonical `.claude/` configuration standard into a target repository. If
the repo already carries another tool's AI-rules setup, the workflow migrates it into
the standard with a user-confirmed mapping plan. Every run snapshots the affected paths
**before** any write, so the entire adoption is reversible with `/revert-ai-rules`.

This skill copies only the **configuration standard** — never the sample application. It
never installs `settings.local.json`, `CLAUDE.local.md`, `.claude/.adopt-backups/`,
`node_modules/`, or the sample app (`src/`, `tests/`, `migrations/`).

## Payload root (§6.4)

The install payload IS the repo's own committed standard artifacts — no separate
templates, no drift. The payload root resolves as:

```
${CLAUDE_PLUGIN_ROOT:-$CLAUDE_PROJECT_DIR}
```

so the same skill works as a plain project today and as a packaged plugin later. The
authoritative list of payload files lives in
[standard-manifest.json](standard-manifest.json); the full source→target mapping lives in
[REFERENCE.md](REFERENCE.md).

Scripts run via `node "${CLAUDE_SKILL_DIR}/scripts/<name>.mjs"`. They use only
`node:fs`, `node:path`, and `node:crypto` — zero npm dependencies, cross-platform.

## Workflow (§6.1)

### 1. Detect

Run the detector against the target repo (defaults to the current directory):

```bash
node "${CLAUDE_SKILL_DIR}/scripts/detect.mjs" "$CLAUDE_PROJECT_DIR"
```

It emits an inventory JSON: `{ targetDir, sources: [{ family, path }], hasClaude, mode }`.
`mode` is `"migrate"` when any foreign (non-Claude) source is found, otherwise
`"greenfield"`. The detected-source globs are listed in [REFERENCE.md](REFERENCE.md) §6.2.

### 2. Branch

- **Greenfield** (no foreign sources): scaffold the canonical payload (from
  [standard-manifest.json](standard-manifest.json), resolved under the payload root) into
  the target. Every payload file becomes an `op: "create"` operation.

- **Migrate**: read each detected source and produce a **mapping plan** using the table in
  [REFERENCE.md](REFERENCE.md) §6.3 (source construct → standard target). Present the plan
  to the user and get explicit confirmation before continuing. Ambiguous or freeform
  content is preserved verbatim under a "Migrated notes (review)" section and flagged.

The confirmed plan is materialized as a JSON plan file with this shape (the interface
`backup.mjs` consumes — see step 3):

```json
{
  "mode": "greenfield | migrate",
  "sources": [ { "family": "...", "path": "..." } ],
  "operations": [
    { "path": "CLAUDE.md", "op": "create" },
    { "path": ".claude/rules/api.md", "op": "modify" },
    { "path": ".cursorrules", "op": "delete" }
  ]
}
```

Each operation carries only `{ path, op }` where `op` is `create` (new file), `modify`
(overwrite a pre-existing file), or `delete` (remove a pre-existing file). Paths are
relative to the target repo root.

### 3. Back up (BEFORE any write)

Snapshot every path the plan will create/modify/delete:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/backup.mjs" "<planFile>" "$CLAUDE_PROJECT_DIR"
```

This writes `.claude/.adopt-backups/<UTC-timestamp>/` containing `manifest.json` (the
§6.5 shape — `adoptionId`, `createdAt`, `mode`, `pluginVersion`, `sources`, `operations`),
verbatim copies of every pre-existing modified/deleted file under `files/`, and a
`revert.log` placeholder. `backup.mjs` prints the `adoptionId` and backup location.

Do this step **before** applying any change. The protect-files hook guards
`.claude/.adopt-backups/`, so a later session cannot clobber the snapshot.

### 4. Apply

Write/patch files per the confirmed plan: create the payload files, overwrite the migrated
targets, and delete the consumed foreign sources. Copy only the configuration standard
listed in [standard-manifest.json](standard-manifest.json) — never the excluded paths.

### 5. Report

Summarize what changed (created / modified / deleted) and tell the user how to undo it:

> To revert this adoption, run `/revert-ai-rules` and choose the snapshot
> `<adoptionId>` (the UTC timestamp printed in step 3). It restores precisely from the
> backup and is git-independent.
