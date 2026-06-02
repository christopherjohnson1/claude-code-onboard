# Adopt AI Rules — Reference

Progressive-disclosure detail for [SKILL.md](SKILL.md). Two authoritative tables: the
detected-sources globs (used by `scripts/detect.mjs`) and the source→standard mapping
(used to build the migration plan).

## Detected sources (globs) — §6.2

`scripts/detect.mjs` globs the target directory for every pattern below, plus existing
`.claude/**`. The `Claude / AGENTS.md` family is **native**; any match in another family
flips the run into `migrate` mode. Walks exclude `node_modules/`, `.git/`, `dist/`,
`build/`, and `vendor/`.

The foreign-family globs are **recursive** (`**/`-prefixed), so a package-local source such
as `packages/web/.cursorrules` or `apps/api/.windsurf/rules/` is detected in a monorepo —
not only a root-level one. `CLAUDE.local.md` and `.claude/**` stay root-anchored on purpose
(local memory and the standard's own `.claude/` tree live at the repo root).

| Family             | Globs                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Claude / AGENTS.md | `CLAUDE.md`, `CLAUDE.local.md`, `**/CLAUDE.md`, `AGENTS.md`, `**/AGENTS.md`, `.claude/**` |
| Cursor             | `**/.cursorrules`, `**/.cursor/rules/**/*.mdc`                                            |
| GitHub Copilot     | `**/.github/copilot-instructions.md`, `**/.github/instructions/**/*.instructions.md`      |
| Windsurf           | `**/.windsurfrules`, `**/.windsurf/rules/**/*`                                            |
| Gemini             | `GEMINI.md`, `**/GEMINI.md`                                                               |
| Cline              | `**/.clinerules`, `**/.clinerules/**/*`                                                   |

The detector emits (the `workspaceRoot`, `isMonorepo`, and `workspaceRoots` fields are
**additive** — the `{ family, path }` pair every consumer relies on is unchanged):

```json
{
  "targetDir": "<abs path>",
  "sources": [
    {
      "family": "cursor",
      "path": "packages/web/.cursorrules",
      "workspaceRoot": "packages/web"
    }
  ],
  "hasClaude": false,
  "mode": "greenfield | migrate",
  "isMonorepo": true,
  "workspaceRoots": ["packages/api", "packages/web"]
}
```

`workspaceRoot` is the nearest enclosing package directory (longest-prefix match against
`workspaceRoots`), or `null`. `isMonorepo` is true when a workspace marker is found
(`workspaces` field, `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, or `turbo.json`) — or,
with no manager at all, when a conventional `packages/`-style layout or ≥2 sibling top-level
project folders are present (each carrying its own manifest or infra marker). The SKILL.md
**Monorepo handling** branch uses these to scope conventions per package.

## Mapping table (source construct → standard target) — §6.3

When migrating, classify each piece of every detected source and route it to the standard
target below. Build a plan the user confirms before any write.

| Source construct                                                                                                              | → Standard target                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Global / always-apply prose conventions                                                                                       | `CLAUDE.md` body (deduped, sectioned)                                                                                                                                          |
| Glob/path-scoped rules (Cursor `.mdc` glob+`alwaysApply:false`, Copilot `applyTo`, Windsurf glob)                             | `.claude/rules/<name>.md` with `paths: [<globs>]`                                                                                                                              |
| Cursor `alwaysApply:true`, no glob                                                                                            | `CLAUDE.md` (or a no-`paths:` rules file)                                                                                                                                      |
| Command/tool prohibitions ("never run rm -rf", "don't touch .env")                                                            | `settings.json` `permissions.deny` + protect-files hook pattern                                                                                                                |
| Build/test/lint commands                                                                                                      | `CLAUDE.md` Commands section                                                                                                                                                   |
| Secret / sensitive-path mentions                                                                                              | `settings.json` `deny(Read(...))`                                                                                                                                              |
| Ambiguous / freeform                                                                                                          | preserved verbatim under "Migrated notes (review)" + flagged                                                                                                                   |
| Package-local source (its `workspaceRoot` is set, e.g. `packages/web/.cursorrules`, or a per-package `CLAUDE.md`/`AGENTS.md`) | a per-package `CLAUDE.md` at `<workspaceRoot>/CLAUDE.md` (lives with the code, dir-owner-maintained) **or** root `.claude/rules/<pkg>.md` with `paths: ["<workspaceRoot>/**"]` |

When a source is package-local, **prefix every derived `paths:` glob with the owning
`workspaceRoot`** and never fold its always-apply prose into the global root `CLAUDE.md` —
that would erase the per-area ownership the [monorepo guide](https://code.claude.com/docs/en/large-codebases)
prescribes. See the SKILL.md **Monorepo handling** branch.

## Plan → backup interface

The confirmed mapping plan is written to a JSON plan file and passed to `backup.mjs`:

```
node "${CLAUDE_SKILL_DIR}/scripts/backup.mjs" <planFile> [targetDir]
```

Plan shape — each operation needs only `{ path, op }`; `backup.mjs` computes
`backupPath`, `sha256Before`, and `sha256After`:

```json
{
  "mode": "greenfield | migrate",
  "sources": [{ "family": "...", "path": "..." }],
  "pluginVersion": "0.1.0",
  "operations": [
    { "path": "CLAUDE.md", "op": "create" },
    { "path": ".claude/rules/api.md", "op": "modify" },
    { "path": ".cursorrules", "op": "delete" }
  ]
}
```

`op` values: `create` (file the adoption adds), `modify` (pre-existing file the adoption
overwrites), `delete` (pre-existing file the adoption removes). `pluginVersion` is
optional — when omitted, `backup.mjs` reads it from
[standard-manifest.json](standard-manifest.json).
