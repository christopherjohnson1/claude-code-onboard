# Adopt AI Rules — Reference

Progressive-disclosure detail for [SKILL.md](SKILL.md). Two authoritative tables: the
detected-sources globs (used by `scripts/detect.mjs`) and the source→standard mapping
(used to build the migration plan).

## Detected sources (globs) — §6.2

`scripts/detect.mjs` globs the target directory for every pattern below, plus existing
`.claude/**`. The `Claude / AGENTS.md` family is **native**; any match in another family
flips the run into `migrate` mode. Walks exclude `node_modules/`, `.git/`, `dist/`,
`build/`, and `vendor/`.

| Family             | Globs                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Claude / AGENTS.md | `CLAUDE.md`, `CLAUDE.local.md`, `**/CLAUDE.md`, `AGENTS.md`, `**/AGENTS.md`, `.claude/**` |
| Cursor             | `.cursorrules`, `.cursor/rules/**/*.mdc`                                                  |
| GitHub Copilot     | `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`            |
| Windsurf           | `.windsurfrules`, `.windsurf/rules/**/*`                                                  |
| Gemini             | `GEMINI.md`, `**/GEMINI.md`                                                               |
| Cline              | `.clinerules`, `.clinerules/**/*`                                                         |

The detector emits:

```json
{
  "targetDir": "<abs path>",
  "sources": [{ "family": "cursor", "path": ".cursorrules" }],
  "hasClaude": false,
  "mode": "greenfield | migrate"
}
```

## Mapping table (source construct → standard target) — §6.3

When migrating, classify each piece of every detected source and route it to the standard
target below. Build a plan the user confirms before any write.

| Source construct                                                                                  | → Standard target                                               |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Global / always-apply prose conventions                                                           | `CLAUDE.md` body (deduped, sectioned)                           |
| Glob/path-scoped rules (Cursor `.mdc` glob+`alwaysApply:false`, Copilot `applyTo`, Windsurf glob) | `.claude/rules/<name>.md` with `paths: [<globs>]`               |
| Cursor `alwaysApply:true`, no glob                                                                | `CLAUDE.md` (or a no-`paths:` rules file)                       |
| Command/tool prohibitions ("never run rm -rf", "don't touch .env")                                | `settings.json` `permissions.deny` + protect-files hook pattern |
| Build/test/lint commands                                                                          | `CLAUDE.md` Commands section                                    |
| Secret / sensitive-path mentions                                                                  | `settings.json` `deny(Read(...))`                               |
| Ambiguous / freeform                                                                              | preserved verbatim under "Migrated notes (review)" + flagged    |

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
