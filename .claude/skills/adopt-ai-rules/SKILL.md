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

It emits an inventory JSON:
`{ targetDir, sources: [{ family, path, workspaceRoot }], hasClaude, mode, isMonorepo, workspaceRoots }`.
`mode` is `"migrate"` when any foreign (non-Claude) source is found, otherwise
`"greenfield"`. `isMonorepo`/`workspaceRoots` flag a workspace layout (npm/yarn/bun
`workspaces`, `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`), and each
source's `workspaceRoot` is the package it belongs to (or `null`). Foreign-source globs are
recursive, so a package-local source such as `packages/web/.cursorrules` is detected, not
only a root-level one. The detected-source globs are listed in
[REFERENCE.md](REFERENCE.md) §6.2; when `isMonorepo` is true, see **Monorepo handling**
below.

### 2. Branch

- **Greenfield** (no foreign sources): scaffold the canonical payload (from
  [standard-manifest.json](standard-manifest.json), resolved under the payload root) into
  the target. Every payload file becomes an `op: "create"` operation.

- **Migrate**: read each detected source and produce a **mapping plan** using the table in
  [REFERENCE.md](REFERENCE.md) §6.3 (source construct → standard target). Present the plan
  to the user and get explicit confirmation before continuing. Ambiguous or freeform
  content is preserved verbatim under a "Migrated notes (review)" section and flagged.

#### Monorepo handling (when `isMonorepo` is true)

The payload's root `CLAUDE.md` describes the sample app's **single-package** layout
(`src/api/handlers/`, `src/lib/`, `tests/`, `migrations/`). In a monorepo those paths exist
in **no** package, so scaffolding that section verbatim ships wrong orientation as fact.
When the detector reports `isMonorepo`, adjust the plan — staying within the least-powerful
layers the standard already uses (layer-1 `CLAUDE.md` memory + path-scoped
`.claude/rules/`), with **no new templating engine and no payload fork**:

1. **Root `CLAUDE.md`: orient, don't mislead.** Replace the single-app "Project layout"
   section with a monorepo orientation header, e.g.:

   > This is a monorepo. Packages live under `<detected workspaceRoots>`. Run commands from
   > the package directory, not the repo root. Each package has its own `package.json` and
   > test suite.

   Keep the repo-wide advisory content (code style, commit etiquette, the "advice vs
   enforcement" framing); drop or genericize anything naming the sample app's paths.

2. **Per-area conventions → root path-scoped rules, by default.** For each package that
   needs its own conventions, add `.claude/rules/<pkg>.md` with
   `paths: ["<workspaceRoot>/**"]` — the same mechanism the shipped `rules/api.md`
   demonstrates. Conventions stay in one owned place and load only when Claude touches that
   package. Each is an additional `op: "create"` entry in the plan.

3. **Per-package `CLAUDE.md` is opt-in only.** If the user wants conventions co-located
   with each package (dir-owner-maintained, loaded when Claude works there), offer to
   scaffold `<workspaceRoot>/CLAUDE.md` per package — but **never auto-generate empty
   stubs** (N owner-less files are exactly the drift the docs warn against). Create only the
   ones the user asks for, again as `op: "create"` entries.

4. **Migrate: preserve per-package scope.** A foreign source whose `workspaceRoot` is set
   (e.g. `packages/web/.cursorrules`) carries that package's conventions — route it to that
   package's `CLAUDE.md`, or to `.claude/rules/<pkg>.md` with
   `paths: ["<workspaceRoot>/**"]`, per [REFERENCE.md](REFERENCE.md) §6.3. **Do not** fold
   package-local prose into the global root `CLAUDE.md`; that destroys the per-area
   ownership the monorepo guide prescribes.

Confirm the adjusted plan with the user before any write, exactly as in the base flow.

The confirmed plan is materialized as a JSON plan file with this shape (the interface
`backup.mjs` consumes — see step 3):

```json
{
  "mode": "greenfield | migrate",
  "sources": [{ "family": "...", "path": "..." }],
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

Also surface this **settings-scope caveat** every time — it is the most common monorepo
footgun:

> The standard installs **one** root `.claude/settings.json`. Unlike `CLAUDE.md`,
> `settings.json` is **not** inherited from parent directories — its `permissions` (the
> `.env`/secret/`curl` denies) and its `$CLAUDE_PROJECT_DIR`-wired hooks apply **only when
> you start Claude from the repo root**. Launch from inside a package
> (`cd packages/api && claude`) and those guards silently don't load. Start from the root,
> or use managed settings for enforcement that doesn't depend on the start directory.
> Hand-maintained per-package `settings.json` copies drift; symlinking `settings.json` is
> unsupported.

When `isMonorepo` is true, also **print** (never write) a worktree note:

> If you use `--worktree` with `worktree.sparsePaths`, the list **must include `.claude`**
> or the standard you just installed won't be present inside the worktree. Pair with
> `worktree.symlinkDirectories: ["node_modules"]` to avoid duplicating deps. `sparsePaths`
> is shared by every worktree in a session (including subagent worktrees), so list every
> package any subagent needs.

Do **not** scaffold `worktree.*` keys into the installed `settings.json`: a guessed,
partial package list would itself break subagent worktrees. This is advice, printed only.
See <https://code.claude.com/docs/en/large-codebases> for the full settings reference.
