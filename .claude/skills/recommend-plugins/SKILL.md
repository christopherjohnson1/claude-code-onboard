---
name: recommend-plugins
description: Scans the codebase and what the user is trying to do, recommends helpful Claude Code plugins. Use when the user asks "what plugins should I install", "recommend plugins", "are there plugins for this stack", "suggest Claude Code plugins", or wants plugin/marketplace recommendations for their repo, languages, frameworks, databases, or workflow. Recommend-only — it prints /plugin commands and never installs.
effort: xhigh
---

# /recommend-plugins

> **HARD INVARIANT — recommend-only.** This skill PRINTS `/plugin` commands for the
> user to run. It MUST NOT install or change anything. Specifically it MUST NOT:
> run `/plugin install` or `/plugin marketplace add`, call `claude plugin …`, edit
> `~/.claude/plugins/installed_plugins.json` or `known_marketplaces.json`, or touch
> any marketplace clone. `scripts/scan.mjs` is pure read-only (no network, no
> writes). All discovery files are read-only. The only output is text the user
> copies and runs themselves.

Scan the current repository and the user's stated goal, then recommend real,
verified Claude Code plugins — ranked, grouped by why they match, each with the
exact install command.

## Workflow

### 1. Scan the repo (read-only)

Run the bundled scanner against the repo root:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/scan.mjs" "$CLAUDE_PROJECT_DIR"
```

It prints JSON: `{ signals: [...], evidence: { signal: [paths] }, alreadyInstalled: [...] }`.
`signals` are drawn from a fixed vocabulary (the keys of the catalog's `signalIndex`).
`evidence` maps each signal to the files that triggered it (cite these to the user).
`alreadyInstalled` is the `<plugin>@<marketplace>` set from `installed_plugins.json`
(read-only). Connection-string detection reports URL scheme + key presence only —
the scanner never reads `.env` or emits secret values.

If the user's request names a stack the scan missed (e.g. "I'm about to add
Stripe"), treat that as an extra signal and reverse-index it the same way.

### 2. Load the bundled catalog

Read `${CLAUDE_SKILL_DIR}/plugins-catalog.json`. This is the offline source of
truth: `marketplaces` (name → `addCommand` + `repo`), `strongPicks` (baseline
picks for any repo), `signalIndex` (signal → plugin names), and `plugins` (each
with `name`, `marketplace`, `description`, `components`, `unique_installs`,
`signals[]`, `strongPick`, `installCommand`).

For each detected signal, look it up in `signalIndex` to get its candidate
plugins. Collect the union, plus everything in `strongPicks`.

### 3. Hybrid-enrich from the live cache (when present)

If `~/.claude/plugins/plugin-catalog-cache.json` exists (v1; official-only, may
be stale or partial), use it to refine `description`, `components`, and
`unique_installs` for any plugin present there — the cache reflects what's
actually published. The cache is best-effort only, never the source of truth:

- It is **official-only** — legal plugins (`claude-for-legal`) are NEVER in the
  cache. For those, use the bundled catalog and note "from bundled catalog".
- It may omit a few newer plugins. For any candidate not found in the cache,
  fall back to the bundled fields and note "from bundled catalog" (and
  "components unavailable" if the bundled entry has `components: null`).
- If the cache file is missing entirely, enrich nothing — use the bundled
  catalog for everything and proceed.

### 4. Suppress already-installed

Drop any candidate whose `<plugin>@<marketplace>` is in the scan's
`alreadyInstalled` set (cross-check against `installed_plugins.json`). Never
recommend something already installed. Keep the suppressed names for the
footnote in step 6.

### 5. Rank

Order the surviving candidates by, in priority order:

1. **`strongPick` first** (the baseline picks that help any repo).
2. then **matching-signal count** — a plugin matching more of the repo's
   detected signals ranks above one matching fewer.
3. then **`unique_installs`** as the tie-break (higher first; treat `null` as 0).

### 6. Print the recommendation

Produce, in this order:

**Strong picks** — a short section listing the `strongPick` plugins (e.g.
`semgrep`, `context7`) that apply to essentially any repo.

**Per-signal groups** — one group per detected signal (in ranked order), each
with a one-line-per-plugin entry:

```
<plugin> — <signal(s)> — <description>
  /plugin install <plugin>@<marketplace>
```

Prepend a marketplace-add line **only when that plugin's marketplace is not
already in `~/.claude/plugins/known_marketplaces.json`** (a marketplace must be
added before its plugins can install):

```
  /plugin marketplace add <owner/repo>
  /plugin install <plugin>@<marketplace>
```

Cite the evidence paths from the scan for each signal so the user sees _why_
(e.g. "postgres — from `prisma/schema.prisma`, `package.json`").

**Already installed (skipped)** — a short footnote listing any candidates that
were suppressed because they're already installed.

**Copy-paste block** — a final fenced block the user can paste wholesale:
all needed `/plugin marketplace add <owner/repo>` lines FIRST (deduped, only for
marketplaces not already known), then all `/plugin install <plugin>@<marketplace>`
lines. This is the deliverable — never run it yourself.

## Honesty notes

- Some ecosystems intentionally have **no** first-party plugin (e.g. docker,
  snyk, circleci). If the user asks, say so plainly rather than inventing one.
- Every plugin name in the bundled catalog is verified verbatim against a
  marketplace's `marketplace.json`. Do not recommend names outside the catalog.

See [REFERENCE.md](REFERENCE.md) for the discovery-file schemas and the full
signal → plugin table.
