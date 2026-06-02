#!/usr/bin/env node
// scan.mjs — read-only repository scanner for /recommend-plugins.
//
// PURE READ-ONLY. NO network. NO install. NO writes. Reads a handful of files
// and prints a single JSON object to stdout describing detected "signals", the
// evidence paths behind each signal, the repo's workspace structure, and the set
// of already-installed plugins.
//
// Every signal name emitted here MUST be a key of plugins-catalog.json's
// "signalIndex" — that is the authoritative vocabulary the SKILL.md workflow
// reverse-indexes against. Do not invent signals outside that set. Monorepo
// structure is therefore reported on a SEPARATE `structure` field, NOT as a
// signal, precisely so the signal vocabulary stays a subset of signalIndex.
//
// MONOREPO AWARENESS: the per-manifest detectors take a directory argument, so
// the scanner runs them at the repo root AND at each workspace package root
// (npm/yarn/bun `workspaces`, pnpm-workspace.yaml, lerna.json, nx.json,
// turbo.json). A depth-3 walk is a safety net for non-standard layouts. Without
// this, a monorepo whose root package.json only carries a `workspaces` field
// would surface ~node/typescript and miss every package's real stack.
//
// Output shape (stdout):
//   {
//     "signals": ["typescript", "node", "postgres", ...],   // sorted, deduped
//     "evidence": { "postgres": ["packages/api/package.json", ...], ... },
//     "structure": { "isMonorepo": true, "tool": "pnpm", "workspaceRoots": [...] },
//     "alreadyInstalled": ["github@claude-plugins-official", ...]
//   }
//
// SECURITY: connection-string / credential detection reports only the URL
// SCHEME and whether a key is present. It NEVER reads .env files and NEVER
// emits secret values.
//
// Dependencies: node:fs and node:path ONLY. Zero npm deps. Cross-platform.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const repoRoot = path.resolve(process.argv[2] || process.cwd());

// Directories never worth scanning (build output, deps, VCS internals).
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "out",
  "coverage",
  ".cache",
  ".turbo",
]);

// ---------------------------------------------------------------------------
// Signal accumulation
// ---------------------------------------------------------------------------

/** @type {Map<string, Set<string>>} signal -> set of evidence paths */
const evidence = new Map();

/**
 * Record that `signal` was detected, with `evidencePath` (absolute or
 * repo-relative) as supporting evidence. Evidence is normalized to a
 * repo-relative POSIX path so per-package manifests cite e.g.
 * "packages/api/package.json", not a bare "package.json".
 * @param {string} signal
 * @param {string} evidencePath
 */
function addSignal(signal, evidencePath) {
  if (!evidence.has(signal)) evidence.set(signal, new Set());
  evidence.get(signal).add(toRelative(evidencePath));
}

/**
 * Convert an absolute path under repoRoot to a forward-slashed relative path.
 * @param {string} p
 * @returns {string}
 */
function toRelative(p) {
  const abs = path.isAbsolute(p) ? p : path.join(repoRoot, p);
  const rel = path.relative(repoRoot, abs) || ".";
  return rel.split(path.sep).join("/");
}

// ---------------------------------------------------------------------------
// Safe filesystem helpers (never throw)
// ---------------------------------------------------------------------------

/** @param {string} p */
function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** @param {string} p */
function readText(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** @param {string} p */
function readJson(p) {
  const text = readText(p);
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** @param {string} p */
function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// .gitignore handling (best-effort, top-level patterns)
// ---------------------------------------------------------------------------

/**
 * Parse the repo-root .gitignore into a set of normalized directory/file names
 * to skip during the shallow walk. We intentionally keep this simple: exact
 * names and leading/trailing-slash forms, which covers the common cases without
 * pulling in a glob engine.
 * @returns {Set<string>}
 */
function loadGitignoreNames() {
  const names = new Set();
  const text = readText(path.join(repoRoot, ".gitignore"));
  if (text == null) return names;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    // Strip leading and trailing slashes, and any glob — we only key on the
    // bare leading path segment for the shallow walk.
    let name = line.replace(/^\/+/, "").replace(/\/+$/, "");
    if (name.includes("/")) name = name.split("/")[0];
    if (name.includes("*")) continue; // skip glob-only patterns
    if (name) names.add(name);
  }
  return names;
}

const gitignored = loadGitignoreNames();

/** @param {string} name */
function shouldSkipDir(name) {
  return (
    EXCLUDED_DIRS.has(name) || gitignored.has(name) || name.startsWith(".")
  );
}

// ---------------------------------------------------------------------------
// Dependency-manifest detection
// ---------------------------------------------------------------------------

// Map of dependency-name substring -> signals. Keys are matched against the
// flattened dependency-name list of each manifest. All target signals are
// catalog signalIndex keys.
const DEP_SIGNAL_RULES = [
  // Frontend frameworks
  { test: /^(react|react-dom)$/, signals: ["frontend"] },
  {
    test: /^(next|nuxt|vue|svelte|@angular\/core|solid-js|astro|remix|@remix-run\/)/,
    signals: ["frontend"],
  },
  { test: /^react-native$/, signals: ["react-native"] },
  { test: /^expo$/, signals: ["react-native"] },
  // API frameworks -> openapi-flavored API context
  {
    test: /^(express|fastify|@nestjs\/core|koa|hapi|@hapi\/hapi|@fastify\/)/,
    signals: ["openapi"],
  },
  { test: /^(flask|django|fastapi)$/, signals: ["openapi"] },
  // Databases / ORMs
  { test: /^(pg|postgres|postgresql|node-postgres)$/, signals: ["postgres"] },
  {
    test: /^(psycopg2|psycopg|psycopg2-binary|asyncpg)$/,
    signals: ["postgres"],
  },
  { test: /^(mysql|mysql2|mariadb)$/, signals: ["mysql"] },
  { test: /^(pymysql|mysqlclient)$/, signals: ["mysql"] },
  { test: /^(mongodb|mongoose)$/, signals: ["mongodb"] },
  { test: /^(pymongo|motor)$/, signals: ["mongodb"] },
  { test: /^(redis|ioredis)$/, signals: ["redis"] },
  { test: /^(prisma|@prisma\/client)$/, signals: ["prisma", "postgres"] },
  {
    test: /^(clickhouse|@clickhouse\/client|clickhouse-connect|clickhouse-driver)$/,
    signals: ["clickhouse"],
  },
  { test: /^(firebase|firebase-admin)$/, signals: ["firebase"] },
  // Vector DBs
  {
    test: /^(@pinecone-database\/pinecone|pinecone-client|pinecone)$/,
    signals: ["vector-db"],
  },
  { test: /^(qdrant-client|@qdrant\/js-client-rest)$/, signals: ["vector-db"] },
  { test: /^(pymilvus|@zilliz\/milvus2-sdk-node)$/, signals: ["vector-db"] },
  // Observability / errors / analytics
  { test: /^@sentry\//, signals: ["error-tracking"] },
  { test: /^sentry-sdk$/, signals: ["error-tracking"] },
  {
    test: /^(dd-trace|datadog-api-client|@datadog\/)/,
    signals: ["monitoring"],
  },
  { test: /^(logfire)$/, signals: ["monitoring", "python"] },
  { test: /^(@amplitude\/|amplitude-js)/, signals: ["analytics"] },
  { test: /^(posthog-js|posthog-node|posthog)$/, signals: ["analytics"] },
  // Payments
  { test: /^stripe$/, signals: ["stripe", "payments"] },
  { test: /^(mercadopago)$/, signals: ["payments"] },
  { test: /^(@revenuecat\/|purchases-)/, signals: ["payments"] },
  { test: /^(@sumup\/)/, signals: ["payments"] },
  // Auth
  { test: /^(@auth0\/|auth0)$/, signals: ["auth"] },
  { test: /^(@workos-inc\/|workos)$/, signals: ["auth"] },
  // AI SDKs
  {
    test: /^(@huggingface\/|huggingface_hub|transformers)$/,
    signals: ["ai-sdk"],
  },
  { test: /^pydantic-ai$/, signals: ["ai-sdk", "python"] },
  // Backend platforms
  {
    test: /^(@supabase\/supabase-js|supabase)$/,
    signals: ["postgres", "prisma"],
  },
  // Commerce
  { test: /^(@shopify\/|shopify-api)/, signals: ["shopify"] },
  // E2E testing
  {
    test: /^(@playwright\/test|playwright)$/,
    signals: ["frontend", "playwright"],
  },
];

/**
 * Apply DEP_SIGNAL_RULES to a list of dependency names, attributing evidence to
 * `manifestPath` (absolute or repo-relative — normalized by addSignal).
 * @param {string[]} depNames
 * @param {string} manifestPath
 */
function mapDepsToSignals(depNames, manifestPath) {
  for (const dep of depNames) {
    for (const rule of DEP_SIGNAL_RULES) {
      if (rule.test.test(dep)) {
        for (const sig of rule.signals) addSignal(sig, manifestPath);
      }
    }
  }
}

function scanPackageJson(dir) {
  const p = path.join(dir, "package.json");
  const pkg = readJson(p);
  if (!pkg) return;
  // Node + TypeScript baseline signals.
  addSignal("node", p);
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };
  const names = Object.keys(deps);
  if (names.includes("typescript") || exists(path.join(dir, "tsconfig.json"))) {
    addSignal("typescript", p);
  }
  mapDepsToSignals(names, p);
}

function scanComposerJson(dir) {
  const p = path.join(dir, "composer.json");
  const composer = readJson(p);
  if (!composer) return;
  addSignal("php", p);
  const deps = {
    ...(composer.require || {}),
    ...(composer["require-dev"] || {}),
  };
  const names = Object.keys(deps);
  if (names.some((n) => n.startsWith("laravel/"))) addSignal("php", p);
  mapDepsToSignals(names, p);
}

function scanPomXml(dir) {
  const p = path.join(dir, "pom.xml");
  const text = readText(p);
  if (text == null) return;
  addSignal("java", p);
  // Kotlin projects frequently still carry a pom.xml; detect via plugin/artifact.
  if (/kotlin/i.test(text)) addSignal("kotlin", p);
  const lower = text.toLowerCase();
  if (/<artifactid>\s*postgresql\b/.test(lower)) addSignal("postgres", p);
  if (/<artifactid>\s*mysql-connector/.test(lower)) addSignal("mysql", p);
  if (/mongodb/.test(lower)) addSignal("mongodb", p);
}

function scanGradle(dir) {
  for (const f of ["build.gradle", "build.gradle.kts", "settings.gradle.kts"]) {
    const p = path.join(dir, f);
    const text = readText(p);
    if (text == null) continue;
    addSignal("java", p);
    if (f.endsWith(".kts") || /kotlin/i.test(text)) addSignal("kotlin", p);
    const lower = text.toLowerCase();
    if (/postgresql/.test(lower)) addSignal("postgres", p);
    if (/mysql/.test(lower)) addSignal("mysql", p);
    if (/mongodb/.test(lower)) addSignal("mongodb", p);
  }
}

/**
 * Parse a list of Python requirement-style names from raw text. Handles
 * requirements.txt lines and bare names; strips version specifiers/extras.
 * @param {string} text
 * @returns {string[]}
 */
function parsePyRequirementNames(text) {
  const names = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    // Strip env markers, extras, and version specifiers.
    const name = line
      .split(";")[0]
      .split("[")[0]
      .split(/[<>=!~ ]/)[0]
      .trim()
      .toLowerCase();
    if (name) names.push(name);
  }
  return names;
}

function scanRequirementsTxt(dir) {
  const p = path.join(dir, "requirements.txt");
  const text = readText(p);
  if (text == null) return;
  addSignal("python", p);
  mapDepsToSignals(parsePyRequirementNames(text), p);
}

function scanPyprojectToml(dir) {
  const p = path.join(dir, "pyproject.toml");
  const text = readText(p);
  if (text == null) return;
  addSignal("python", p);
  // Lightweight extraction of dependency names from common TOML dependency
  // declarations (PEP 621 [project.dependencies], Poetry [tool.poetry...]).
  const names = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    // PEP 621 array-of-string entries: "fastapi>=0.1"
    const quoted = line.match(/^["']([A-Za-z0-9_.\-]+)/);
    if (quoted) {
      names.push(quoted[1].toLowerCase());
      continue;
    }
    // Poetry table entries: fastapi = "^0.1"
    const kv = line.match(/^([A-Za-z0-9_.\-]+)\s*=/);
    if (kv && kv[1].toLowerCase() !== "python") names.push(kv[1].toLowerCase());
  }
  mapDepsToSignals(names, p);
}

function scanGoMod(dir) {
  const p = path.join(dir, "go.mod");
  const text = readText(p);
  if (text == null) return;
  addSignal("go", p);
  const lower = text.toLowerCase();
  if (/github\.com\/lib\/pq|jackc\/pgx/.test(lower)) addSignal("postgres", p);
  if (/go-sql-driver\/mysql/.test(lower)) addSignal("mysql", p);
  if (/go\.mongodb\.org\/mongo-driver/.test(lower)) addSignal("mongodb", p);
  if (/redis\/go-redis|gomodule\/redigo/.test(lower)) addSignal("redis", p);
}

function scanCargoToml(dir) {
  const p = path.join(dir, "Cargo.toml");
  const text = readText(p);
  if (text == null) return;
  addSignal("rust", p);
}

function scanGemfile(dir) {
  const p = path.join(dir, "Gemfile");
  const text = readText(p);
  if (text == null) return;
  addSignal("ruby", p);
  const lower = text.toLowerCase();
  if (/\bpg\b|gem ['"]pg['"]/.test(lower)) addSignal("postgres", p);
  if (/mysql2/.test(lower)) addSignal("mysql", p);
  if (/mongoid|\bmongo\b/.test(lower)) addSignal("mongodb", p);
}

// ---------------------------------------------------------------------------
// Config / marker-file presence detection (per directory)
// ---------------------------------------------------------------------------

function scanDirMarkers(dir) {
  // Exact-name markers, checked in `dir` (root or a workspace package root).
  const dirMarkers = [
    { file: "Dockerfile", signals: [] }, // intentionally no signal: no first-party docker plugin
    { file: "serverless.yml", signals: ["serverless"] },
    { file: "serverless.yaml", signals: ["serverless"] },
    { file: "vercel.json", signals: ["vercel"] },
    { file: "netlify.toml", signals: ["netlify"] },
    { file: "wrangler.toml", signals: ["cloudflare"] },
    { file: "wrangler.jsonc", signals: ["cloudflare"] },
    { file: "wrangler.json", signals: ["cloudflare"] },
    { file: "railway.json", signals: ["railway"] },
    { file: "railway.toml", signals: ["railway"] },
    { file: "firebase.json", signals: ["firebase"] },
    { file: "mint.json", signals: ["docs-site"] },
    { file: "docs.json", signals: ["docs-site"] },
    // Language / cloud toolchain markers. Each target is a catalog signalIndex
    // key; the matching language-LSP / cloud plugins are reverse-indexed from it
    // by the skill workflow.
    { file: "CMakeLists.txt", signals: ["cpp"] },
    { file: "Package.swift", signals: ["swift"] },
    { file: ".luarc.json", signals: ["lua"] },
    { file: "samconfig.toml", signals: ["aws"] }, // AWS SAM
    { file: "cdk.json", signals: ["aws"] }, // AWS CDK
    { file: "azure-pipelines.yml", signals: ["azure"] },
    { file: "azure-pipelines.yaml", signals: ["azure"] },
  ];
  for (const m of dirMarkers) {
    const p = path.join(dir, m.file);
    if (exists(p)) {
      if (m.signals.length === 0) continue; // present but maps to no plugin
      for (const s of m.signals) addSignal(s, p);
    }
  }

  // Prisma schema -> prisma + postgres.
  const prismaSchema = path.join(dir, "prisma", "schema.prisma");
  if (exists(prismaSchema)) {
    addSignal("prisma", prismaSchema);
    addSignal("postgres", prismaSchema);
  }

  // Playwright config (any extension).
  for (const ext of ["ts", "js", "mjs", "cjs"]) {
    const p = path.join(dir, `playwright.config.${ext}`);
    if (exists(p)) {
      addSignal("playwright", p);
      addSignal("frontend", p);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Per-directory dependency + marker scan (root and each workspace package)
// ---------------------------------------------------------------------------

function scanDir(dir) {
  scanPackageJson(dir);
  scanComposerJson(dir);
  scanPomXml(dir);
  scanGradle(dir);
  scanRequirementsTxt(dir);
  scanPyprojectToml(dir);
  scanGoMod(dir);
  scanCargoToml(dir);
  scanGemfile(dir);
  scanDirMarkers(dir);
  scanConnectionStringSchemes(dir);
}

// Dispatch the single manifest detector matching `filename` for directory `dir`.
// Used as the depth-3 safety net for layouts a workspace declaration doesn't list.
function dispatchManifest(filename, dir) {
  switch (filename) {
    case "package.json":
      scanPackageJson(dir);
      break;
    case "composer.json":
      scanComposerJson(dir);
      break;
    case "pom.xml":
      scanPomXml(dir);
      break;
    case "build.gradle":
    case "build.gradle.kts":
    case "settings.gradle.kts":
      scanGradle(dir);
      break;
    case "requirements.txt":
      scanRequirementsTxt(dir);
      break;
    case "pyproject.toml":
      scanPyprojectToml(dir);
      break;
    case "go.mod":
      scanGoMod(dir);
      break;
    case "Cargo.toml":
      scanCargoToml(dir);
      break;
    case "Gemfile":
      scanGemfile(dir);
      break;
  }
}

// ---------------------------------------------------------------------------
// Monorepo / workspace detection (reported on a separate `structure` field)
// ---------------------------------------------------------------------------

// Expand workspace globs ("packages/*", "apps/web", "libs/**") to concrete
// repo-relative dirs (immediate children of the last literal parent segment).
function expandWorkspaceGlobs(globs) {
  const out = new Set();
  for (const raw of globs) {
    if (typeof raw !== "string") continue;
    const g = raw.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!g) continue;
    if (!g.includes("*")) {
      if (isDir(path.join(repoRoot, g))) out.add(g);
      continue;
    }
    const parentSegs = [];
    for (const seg of g.split("/")) {
      if (seg.includes("*")) break;
      parentSegs.push(seg);
    }
    const parentRel = parentSegs.join("/");
    const parentAbs = parentRel ? path.join(repoRoot, parentRel) : repoRoot;
    let entries;
    try {
      entries = fs.readdirSync(parentAbs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || shouldSkipDir(e.name)) continue;
      out.add(parentRel ? parentRel + "/" + e.name : e.name);
    }
  }
  return [...out];
}

// Conventional parents whose children are usually packages.
const WORKSPACE_PARENTS = [
  "packages",
  "apps",
  "services",
  "libs",
  "modules",
  "projects",
];

// Manifests whose presence at a directory's root marks it as a project of its own.
const PROJECT_MANIFESTS = [
  "package.json",
  "project.json", // nx
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "Gemfile",
  "pubspec.yaml", // Flutter / Dart
];

const PROJECT_MANIFEST_SET = new Set(PROJECT_MANIFESTS);

// A filename that marks a project of its own: a recognized manifest (exact name) or an
// infra/build marker by extension (.tf/.tf.json/.bicep, cdk.json, serverless.yml,
// .csproj/.sln).
function isProjectMarkerFile(name) {
  if (PROJECT_MANIFEST_SET.has(name)) return true;
  const n = name.toLowerCase();
  return (
    n.endsWith(".tf") ||
    n.endsWith(".tf.json") ||
    n.endsWith(".bicep") ||
    n === "cdk.json" ||
    n === "serverless.yml" ||
    n === "serverless.yaml" ||
    n.endsWith(".csproj") ||
    n.endsWith(".sln")
  );
}

// Does `dirAbs` look like a project root? True if a manifest or infra/build marker appears
// within `maxDepth` levels (0 = the dir itself). The shallow descent handles .NET/infra
// layouts that nest the manifest under src/. Skips excluded/dot dirs while descending.
function looksLikeProjectDir(dirAbs, maxDepth = 2, depth = 0) {
  let entries;
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return false;
  }
  const subdirs = [];
  for (const e of entries) {
    if (e.isFile()) {
      if (isProjectMarkerFile(e.name)) return true;
    } else if (e.isDirectory() && !shouldSkipDir(e.name)) {
      subdirs.push(e.name);
    }
  }
  if (depth >= maxDepth) return false;
  for (const sd of subdirs) {
    if (looksLikeProjectDir(path.join(dirAbs, sd), maxDepth, depth + 1)) {
      return true;
    }
  }
  return false;
}

// Immediate child directories of `parentRel` that look like projects. "" enumerates the
// repo root's own top-level directories.
function projectChildren(parentRel) {
  const parentAbs = parentRel ? path.join(repoRoot, parentRel) : repoRoot;
  let entries;
  try {
    entries = fs.readdirSync(parentAbs, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || shouldSkipDir(e.name)) continue;
    const childRel = parentRel ? parentRel + "/" + e.name : e.name;
    if (looksLikeProjectDir(path.join(repoRoot, childRel))) out.push(childRel);
  }
  return out;
}

function detectWorkspaceInfo() {
  const tools = [];
  const globs = [];

  // npm / yarn / bun workspaces in package.json (array or { packages: [...] }).
  const pkg = readJson(path.join(repoRoot, "package.json"));
  if (pkg && pkg.workspaces) {
    tools.push("npm/yarn workspaces");
    const ws = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : Array.isArray(pkg.workspaces.packages)
        ? pkg.workspaces.packages
        : [];
    for (const g of ws) if (typeof g === "string") globs.push(g);
  }

  // pnpm-workspace.yaml — minimal "packages:" YAML list parser (no yaml dep).
  const pnpmText = readText(path.join(repoRoot, "pnpm-workspace.yaml"));
  if (pnpmText != null) {
    tools.push("pnpm");
    let inPackages = false;
    for (const rawLine of pnpmText.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+$/, "");
      if (/^packages\s*:/.test(line)) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        const m = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
        if (m) globs.push(m[1].trim());
        else if (/^\S/.test(line)) inPackages = false; // dedent ends the block
      }
    }
  }

  // lerna.json
  const lerna = readJson(path.join(repoRoot, "lerna.json"));
  if (lerna) {
    tools.push("lerna");
    if (Array.isArray(lerna.packages))
      for (const g of lerna.packages) if (typeof g === "string") globs.push(g);
  }

  if (exists(path.join(repoRoot, "nx.json"))) tools.push("nx");
  if (exists(path.join(repoRoot, "turbo.json"))) tools.push("turbo");

  const roots = new Set(expandWorkspaceGlobs(globs));

  // Fallback 1: conventional parents (packages/ apps/ services/ libs/ …), with OR without
  // a workspace marker — the parent name is the signal, so ≥1 project child is enough.
  if (roots.size === 0) {
    for (const base of WORKSPACE_PARENTS) {
      if (!isDir(path.join(repoRoot, base))) continue;
      for (const child of projectChildren(base)) roots.add(child);
    }
    if (roots.size && tools.length === 0)
      tools.push("convention (packages/, apps/, …)");
  }

  // Fallback 2 (marker-less): several sibling project folders at the repo root, even with
  // no workspace manager and no packages/ parent — e.g. api/, webapp/, emails/,
  // infrastructure/, a flutter wrapper. Require ≥2 to avoid flagging an ordinary app with
  // a single nested sub-project (functions/, examples/).
  if (roots.size === 0 && tools.length === 0) {
    const top = projectChildren("");
    if (top.length >= 2) {
      top.forEach((r) => roots.add(r));
      tools.push("top-level project folders (no workspace manager)");
    }
  }

  const workspaceRoots = [...roots].sort();
  return {
    isMonorepo: tools.length > 0 || workspaceRoots.length > 0,
    tool: tools.join(", ") || null,
    workspaceRoots,
  };
}

/**
 * Shallow walk (max depth 3) to find Terraform files and OpenAPI/Swagger specs
 * without descending into excluded directories, and — as a safety net for
 * non-standard monorepo layouts — to dispatch the manifest detectors for any
 * package manifest found below the root. Records the first few tree-marker
 * matches as evidence to keep output compact.
 */
function scanTreeMarkers() {
  const MAX_DEPTH = 3;
  const MAX_EVIDENCE_PER_SIGNAL = 5;
  const tfCount = { n: 0 };
  const openapiCount = { n: 0 };
  // Extension-based language/cloud markers found anywhere in the shallow walk.
  const extCounts = { csharp: 0, cpp: 0, lua: 0, azure: 0 };

  const MANIFEST_NAMES = new Set([
    "package.json",
    "composer.json",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle.kts",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
    "Gemfile",
  ]);

  /** @param {string} dir @param {number} depth */
  function walk(dir, depth) {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        // Manifest safety net: dispatch below the root (root is scanned in main).
        if (depth >= 1 && MANIFEST_NAMES.has(entry.name)) {
          dispatchManifest(entry.name, dir);
        }
        const name = entry.name.toLowerCase();
        // Terraform
        if (
          (name.endsWith(".tf") || name.endsWith(".tf.json")) &&
          tfCount.n < MAX_EVIDENCE_PER_SIGNAL
        ) {
          addSignal("terraform", full);
          tfCount.n++;
        }
        // OpenAPI / Swagger specs by conventional filename.
        if (
          openapiCount.n < MAX_EVIDENCE_PER_SIGNAL &&
          /^(openapi|swagger)\.(ya?ml|json)$/.test(name)
        ) {
          addSignal("openapi", full);
          openapiCount.n++;
        }
        // .NET / C# projects
        if (
          (name.endsWith(".csproj") || name.endsWith(".sln")) &&
          extCounts.csharp < MAX_EVIDENCE_PER_SIGNAL
        ) {
          addSignal("csharp", full);
          extCounts.csharp++;
        }
        // C++ MSBuild projects
        if (
          name.endsWith(".vcxproj") &&
          extCounts.cpp < MAX_EVIDENCE_PER_SIGNAL
        ) {
          addSignal("cpp", full);
          extCounts.cpp++;
        }
        // Lua rockspecs
        if (
          name.endsWith(".rockspec") &&
          extCounts.lua < MAX_EVIDENCE_PER_SIGNAL
        ) {
          addSignal("lua", full);
          extCounts.lua++;
        }
        // Azure Bicep IaC
        if (
          name.endsWith(".bicep") &&
          extCounts.azure < MAX_EVIDENCE_PER_SIGNAL
        ) {
          addSignal("azure", full);
          extCounts.azure++;
        }
      }
    }
  }

  walk(repoRoot, 0);
}

// ---------------------------------------------------------------------------
// Git remote host detection (.git/config)
// ---------------------------------------------------------------------------

function scanGitRemote() {
  const cfg = readText(path.join(repoRoot, ".git", "config"));
  if (cfg == null) return;
  // Only inspect remote URL lines; never emit the URL itself.
  for (const raw of cfg.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("url")) continue;
    const value = line.split("=").slice(1).join("=").trim().toLowerCase();
    if (value.includes("github.com")) addSignal("github", ".git/config");
    else if (value.includes("gitlab.com")) addSignal("gitlab", ".git/config");
  }
}

// ---------------------------------------------------------------------------
// Connection-string SCHEME detection (scheme + key-presence ONLY)
// ---------------------------------------------------------------------------

// Database/service URL schemes whose mere presence implies a backing service.
// We map the SCHEME to a signal. We do NOT read .env files and we NEVER emit
// the matched URL or any credential within it.
const SCHEME_SIGNAL_RULES = [
  { scheme: /\bpostgres(ql)?:\/\//i, signal: "postgres" },
  { scheme: /\bmysql:\/\//i, signal: "mysql" },
  { scheme: /\bmongodb(\+srv)?:\/\//i, signal: "mongodb" },
  { scheme: /\bredis(s)?:\/\//i, signal: "redis" },
  { scheme: /\bclickhouse:\/\//i, signal: "clickhouse" },
];

/**
 * Scan a small allow-list of NON-secret config files in `dir` for
 * connection-string SCHEMES only. .env / .env.* are explicitly excluded — we
 * never read them. For each match we record the file as evidence and the
 * signal; the actual URL and any embedded credentials are discarded immediately.
 */
function scanConnectionStringSchemes(dir) {
  // Only inspect example/template config that is safe to read and commonly
  // committed. Real secrets live in .env*, which we deliberately skip.
  const candidates = [
    ".env.example",
    ".env.sample",
    ".env.template",
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ];
  for (const file of candidates) {
    const p = path.join(dir, file);
    const text = readText(p);
    if (text == null) continue;
    for (const rule of SCHEME_SIGNAL_RULES) {
      if (rule.scheme.test(text)) addSignal(rule.signal, p);
    }
  }
}

// ---------------------------------------------------------------------------
// Already-installed plugins (read-only)
// ---------------------------------------------------------------------------

/**
 * Read ~/.claude/plugins/installed_plugins.json (v2) and return the set of
 * `<plugin>@<marketplace>` keys. Read-only; returns [] if absent/unreadable.
 * @returns {string[]}
 */
function readAlreadyInstalled() {
  const p = path.join(
    os.homedir(),
    ".claude",
    "plugins",
    "installed_plugins.json",
  );
  const data = readJson(p);
  if (!data || typeof data !== "object") return [];
  // v2 shape: { version: 2, plugins: { "<plugin>@<marketplace>": [...] } }
  if (data.plugins && typeof data.plugins === "object") {
    return Object.keys(data.plugins).sort();
  }
  // Defensive: tolerate a flat object keyed by plugin id.
  return Object.keys(data)
    .filter((k) => k.includes("@"))
    .sort();
}

// ---------------------------------------------------------------------------
// Run all detectors and emit
// ---------------------------------------------------------------------------

function main() {
  // Root scan (identical behavior to before for a flat, single-package repo).
  scanDir(repoRoot);

  // Repo-level-only markers.
  if (isDir(path.join(repoRoot, ".claude-plugin"))) {
    addSignal("mcp-dev", path.join(repoRoot, ".claude-plugin"));
  }
  scanGitRemote();

  // Monorepo: scan each workspace package root so per-package stacks surface.
  const structure = detectWorkspaceInfo();
  for (const rel of structure.workspaceRoots) {
    scanDir(path.join(repoRoot, rel));
  }

  // Tree markers + depth-3 manifest safety net for non-standard layouts.
  scanTreeMarkers();

  const signals = [...evidence.keys()].sort();
  /** @type {Record<string, string[]>} */
  const evidenceOut = {};
  for (const sig of signals) {
    evidenceOut[sig] = [...evidence.get(sig)].sort();
  }

  const result = {
    signals,
    evidence: evidenceOut,
    structure,
    alreadyInstalled: readAlreadyInstalled(),
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main();
