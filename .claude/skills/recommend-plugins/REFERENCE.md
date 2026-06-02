# /recommend-plugins — Reference

Schemas for the plugin discovery files this skill reads (all read-only), and the
full signal → plugin table mirroring `plugins-catalog.json`'s `signalIndex`.

All discovery files live under `~/.claude/plugins/`. This skill NEVER writes to
any of them — it only reads them to enrich, suppress, and decide whether a
marketplace-add line is needed.

---

## Discovery-file schemas

### `known_marketplaces.json`

Registered marketplaces. A marketplace must be **added** before any of its
plugins can install — so when a recommended plugin's marketplace is absent here,
the skill prepends `/plugin marketplace add <owner/repo>` to its install line.

```jsonc
{
  "<marketplace-name>": {
    "source": { "source": "github", "repo": "<owner>/<repo>" },
    "installLocation": "<absolute path to local clone>",
    "lastUpdated": "<ISO8601>",
  },
}
```

Used for: deciding whether a `/plugin marketplace add` line is required.

### `installed_plugins.json` (v2)

The **suppression set** — never recommend what's already installed.

```jsonc
{
  "version": 2,
  "plugins": {
    "<plugin>@<marketplace>": [
      {
        "scope": "user",
        "installPath": "<absolute path>",
        "version": "<semver | \"unknown\">",
        "installedAt": "<ISO8601>",
        "lastUpdated": "<ISO8601>",
        "gitCommitSha": "<sha, optional>",
      },
    ],
  },
}
```

The keys of `plugins` (`<plugin>@<marketplace>`) are the suppression set. The
scanner returns them as `alreadyInstalled`.

### `plugin-catalog-cache.json` (v1)

A near-complete **OFFICIAL-only** snapshot used to enrich descriptions,
component counts, and popularity. Best-effort only — official-only, may be a
subset (a few newer plugins absent), and can be stale or missing. **Never the
source of truth.**

```jsonc
{
  "version": 1,
  "fetchedAt": "<ISO8601>",
  "catalog": {
    "generated_at": "<ISO8601>",
    "installs_generated_at": "<ISO8601>",
    "marketplace_sha": "<sha>",
    "models": ["claude-opus-4-7", "claude-sonnet-4-6"],
    "plugins": {
      "<plugin>@<marketplace>": {
        "plugin": "<plugin>",
        "tokens": {
          /* … */
        },
        "components": {
          "commands": [
            { "name": "...", "chars": { "always_on": 0, "on_invoke": 0 } },
          ],
          "agents": [
            /* … */
          ],
          "skills": [
            /* … */
          ],
          "hooks": [
            /* … */
          ],
          "mcpServers": [
            /* … */
          ],
          "lspServers": [
            /* … */
          ],
        },
        "unique_installs": 463,
        "last_updated": "<ISO8601>",
        "marketplace_entry": {
          "name": "...",
          "description": "...",
          "author": {},
          "category": "...",
          "source": {},
          "homepage": "...",
        },
        "version": "<semver>",
        "source": {
          /* … */
        },
        "sha": "<sha>",
        "source_sha": "<sha>",
      },
    },
  },
}
```

Enrichment notes:

- The human-readable description lives at `catalog.plugins[id].marketplace_entry.description`.
- Component **counts** are the array lengths under `catalog.plugins[id].components`
  (e.g. `components.skills.length` skills, `components.mcpServers.length` MCP servers).
- `unique_installs` is the popularity tie-break.
- `claude-for-legal` plugins are NEVER present (official-only cache). Use the
  bundled catalog for those and note "from bundled catalog".

### `marketplace.json` (authoritative existence)

A plugin exists if and only if it's listed in a marketplace's
`.claude-plugin/marketplace.json` (NOT merely because a local folder exists).
Required fields:

- top level: `name`, `owner.name`, `plugins[]`
- each `plugins[]` entry: `name` + `source`

```jsonc
{
  "name": "<marketplace-name>",
  "owner": { "name": "<owner>" },
  "plugins": [
    {
      "name": "<plugin>",
      "source": {
        /* … */
      },
      "description": "…",
    },
  ],
}
```

### `plugin.json`

Per-plugin manifest inside the plugin. **Only `name` is required.** There is NO
version/engine gate — do not assume one exists.

```jsonc
{ "name": "<plugin>", "description": "…", "version": "…", "keywords": ["…"] }
```

---

## Catalog honesty points

- **No first-party plugin** for some popular tools — `docker`, `snyk`, and
  `circleci` are intentionally ABSENT from the catalog because no such
  first-party plugin exists. The scanner deliberately maps `Dockerfile` to no
  signal. If asked, say so plainly; do not fabricate a plugin name.
- **Legal plugins are bundled-catalog-only.** The `claude-for-legal` plugins
  exist only in the bundled `plugins-catalog.json`; the live cache is
  official-only and will never contain them, so their `components` /
  `unique_installs` come from the bundled entry (often `null` →
  "components unavailable").

---

## Monorepo structure (reported, but not a signal)

`scan.mjs` emits a `structure` field — `{ isMonorepo, tool, workspaceRoots }` — kept
deliberately OUT of the `signals` array so the signal vocabulary stays a strict subset of
`signalIndex` (the scanner's stated invariant). `tool` names the workspace manager(s)
detected (`npm/yarn workspaces`, `pnpm`, `lerna`, `nx`, `turbo`), or `convention (packages/,
apps/, …)` / `top-level project folders (no workspace manager)` when there is no manager but
the layout is still a monorepo; `workspaceRoots` lists the package directories the scan
recursed into (so per-package evidence reads `packages/api/package.json`, not a bare
`package.json`). SKILL.md [step 7](SKILL.md) uses
this to lead with a large-codebase note. There is intentionally **no `monorepo` key in
`signalIndex`** — if there were, step 6's per-signal grouping would try to print an empty
"monorepo" group.

The per-language **`*-lsp` code-intelligence plugins** already in the table below double as
the large-codebase answer: they replace tree-walking file reads with language-server
lookups (jump-to-definition, find-references). No new catalog entries are needed for
monorepo support — the existing language signals already reverse-index to them.

---

## Full signal → plugin table

Mirrors `plugins-catalog.json`'s `signalIndex`. `strongPicks` (`semgrep`,
`context7`) apply to any repo regardless of signal.

| Signal           | Plugins                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend`       | chrome-devtools-mcp, frontend-design, playwright                                                                                                                                                                    |
| `react-native`   | expo                                                                                                                                                                                                                |
| `terraform`      | aws-core, terraform                                                                                                                                                                                                 |
| `serverless`     | aws-core, aws-serverless                                                                                                                                                                                            |
| `vercel`         | vercel                                                                                                                                                                                                              |
| `netlify`        | netlify-skills                                                                                                                                                                                                      |
| `cloudflare`     | cloudflare                                                                                                                                                                                                          |
| `railway`        | railway                                                                                                                                                                                                             |
| `aws`            | aws-core, aws-dev-toolkit, aws-serverless, deploy-on-aws                                                                                                                                                            |
| `azure`          | azure                                                                                                                                                                                                               |
| `postgres`       | alloydb, cockroachdb, neon, planetscale, prisma, supabase                                                                                                                                                           |
| `mysql`          | planetscale                                                                                                                                                                                                         |
| `mongodb`        | mongodb                                                                                                                                                                                                             |
| `redis`          | redis-development                                                                                                                                                                                                   |
| `prisma`         | neon, prisma, supabase                                                                                                                                                                                              |
| `clickhouse`     | clickhouse                                                                                                                                                                                                          |
| `firebase`       | firebase                                                                                                                                                                                                            |
| `vector-db`      | pinecone, qdrant-skills, zilliz                                                                                                                                                                                     |
| `openapi`        | 42crunch-api-security-testing, postman                                                                                                                                                                              |
| `docs-site`      | context7, mintlify                                                                                                                                                                                                  |
| `playwright`     | chrome-devtools-mcp, playwright                                                                                                                                                                                     |
| `stripe`         | stripe                                                                                                                                                                                                              |
| `payments`       | mercadopago, revenuecat, stripe, sumup                                                                                                                                                                              |
| `error-tracking` | sentry, sentry-cli                                                                                                                                                                                                  |
| `monitoring`     | datadog, logfire, rootly, sentry                                                                                                                                                                                    |
| `analytics`      | amplitude, posthog                                                                                                                                                                                                  |
| `ai-sdk`         | huggingface-skills, pydantic-ai                                                                                                                                                                                     |
| `github`         | code-review, coderabbit, github, greptile, pr-review-toolkit                                                                                                                                                        |
| `gitlab`         | gitlab                                                                                                                                                                                                              |
| `mcp-dev`        | agent-sdk-dev, mcp-apps, mcp-server-dev, plugin-dev                                                                                                                                                                 |
| `shopify`        | shopify                                                                                                                                                                                                             |
| `auth`           | auth0, workos                                                                                                                                                                                                       |
| `node`           | typescript-lsp                                                                                                                                                                                                      |
| `typescript`     | typescript-lsp                                                                                                                                                                                                      |
| `python`         | logfire, pydantic-ai, pyright-lsp                                                                                                                                                                                   |
| `go`             | gopls-lsp                                                                                                                                                                                                           |
| `rust`           | rust-analyzer-lsp                                                                                                                                                                                                   |
| `java`           | jdtls-lsp                                                                                                                                                                                                           |
| `php`            | laravel-boost, php-lsp                                                                                                                                                                                              |
| `ruby`           | ruby-lsp                                                                                                                                                                                                            |
| `csharp`         | csharp-lsp                                                                                                                                                                                                          |
| `swift`          | swift-lsp                                                                                                                                                                                                           |
| `kotlin`         | kotlin-lsp                                                                                                                                                                                                          |
| `cpp`            | clangd-lsp                                                                                                                                                                                                          |
| `lua`            | lua-lsp                                                                                                                                                                                                             |
| `legal`          | ai-governance-legal, cocounsel-legal, commercial-legal, corporate-legal, employment-legal, ip-legal, law-student, legal-builder-hub, legal-clinic, litigation-legal, privacy-legal, product-legal, regulatory-legal |

### How the scanner maps repo evidence to these signals

| Repo evidence                                                  | Signal(s)                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `package.json` present                                         | node (+ typescript if `typescript` dep or `tsconfig.json`) |
| react / next / vue / svelte / angular / astro / remix deps     | frontend                                                   |
| react-native / expo deps                                       | react-native                                               |
| express / fastify / nest / koa / flask / django / fastapi deps | openapi (API context)                                      |
| pg / postgres / asyncpg / psycopg deps; `postgres://` scheme   | postgres                                                   |
| mysql / mysql2 / mariadb deps; `mysql://` scheme               | mysql                                                      |
| mongodb / mongoose / pymongo deps; `mongodb://` scheme         | mongodb                                                    |
| redis / ioredis deps; `redis://` scheme                        | redis                                                      |
| prisma / @prisma/client; `prisma/schema.prisma`                | prisma + postgres                                          |
| @supabase/supabase-js                                          | postgres + prisma                                          |
| clickhouse deps; `clickhouse://` scheme                        | clickhouse                                                 |
| firebase / firebase-admin; `firebase.json`                     | firebase                                                   |
| pinecone / qdrant / milvus deps                                | vector-db                                                  |
| @sentry/\* deps                                                | error-tracking                                             |
| datadog deps                                                   | monitoring                                                 |
| amplitude / posthog deps                                       | analytics                                                  |
| stripe dep                                                     | stripe + payments                                          |
| mercadopago / revenuecat / sumup deps                          | payments                                                   |
| @auth0 / @workos-inc deps                                      | auth                                                       |
| huggingface / pydantic-ai deps                                 | ai-sdk                                                     |
| @shopify/\* deps                                               | shopify                                                    |
| @playwright/test dep; `playwright.config.*`                    | playwright + frontend                                      |
| `*.tf` / `*.tf.json` files                                     | terraform                                                  |
| `serverless.yml`                                               | serverless                                                 |
| `vercel.json`                                                  | vercel                                                     |
| `netlify.toml`                                                 | netlify                                                    |
| `wrangler.toml` / `wrangler.json(c)`                           | cloudflare                                                 |
| `railway.json` / `railway.toml`                                | railway                                                    |
| `openapi.{yml,yaml,json}` / `swagger.*`                        | openapi                                                    |
| `mint.json` / `docs.json`                                      | docs-site                                                  |
| `.claude-plugin/` directory                                    | mcp-dev                                                    |
| `composer.json` (+ laravel/\*)                                 | php                                                        |
| `pom.xml` / `build.gradle*`                                    | java (+ kotlin if Kotlin)                                  |
| `requirements.txt` / `pyproject.toml`                          | python                                                     |
| `go.mod`                                                       | go                                                         |
| `Cargo.toml`                                                   | rust                                                       |
| `Gemfile`                                                      | ruby                                                       |
| `.git/config` remote host github.com                           | github                                                     |
| `.git/config` remote host gitlab.com                           | gitlab                                                     |
| `Dockerfile`                                                   | (none — no first-party docker plugin)                      |

> The scanner never reads `.env` files. Connection-string detection only
> inspects committed example/compose files for the URL **scheme**, and records
> only the scheme → signal mapping — never the URL or any credential value.
