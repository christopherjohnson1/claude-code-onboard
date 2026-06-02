#!/usr/bin/env node
// detect.mjs — Inventory existing AI-rules sources in a target directory (§6.1 step 1, §6.2).
//
// Input:  argv[2] = target directory (default: process.cwd()).
// Output: an inventory JSON object on stdout:
//           {
//             targetDir: "<abs path>",
//             sources: [ { family, path, workspaceRoot } ], // path relative to targetDir, POSIX;
//                                                            // workspaceRoot = nearest enclosing
//                                                            // package dir in a monorepo, else null
//             hasClaude: boolean,             // any Claude/AGENTS.md/.claude source found
//             mode: "greenfield" | "migrate", // migrate iff a FOREIGN (non-Claude) source exists
//             isMonorepo: boolean,            // workspace marker, conventional packages/ layout,
//                                             // or >=2 sibling project folders (ADDITIVE field)
//             workspaceRoots: string[]        // POSIX-relative package dirs, e.g. ["packages/api"]
//                                             // or top-level project dirs, e.g. ["api","webapp"]
//           }
//
// The isMonorepo / workspaceRoots fields and the per-source workspaceRoot key are ADDITIVE:
// the original { family, path } pair every consumer relies on is unchanged. backup.mjs /
// restore.mjs consume the user-confirmed PLAN file (built by the model), not this output, so
// adding fields here cannot affect them.
//
// Pure Node ESM. Uses only node:fs and node:path. No npm deps. Cross-platform.
// Excludes node_modules / .git / dist / build / vendor when walking globbed trees.

import fs from "node:fs";
import path from "node:path";

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "vendor",
]);

// Each family lists glob-like patterns. We implement just the subset of glob we need:
//   - literal path           -> exact file check
//   - "**/<name>"            -> recursive search for files named <name>
//   - "**/<a>/<b>"           -> recursive search for files whose path ends with "<a>/<b>"
//   - "<dir>/**"             -> every file under <dir> (recursive)
//   - "<dir>/**/*.ext"       -> every file under <dir> ending in .ext (recursive)
//   - "**/<dir>/**"          -> every file under ANY directory whose path ends with <dir>
//   - "**/<dir>/**/*.ext"    -> same, filtered by suffix (.ext may contain dots)
// Foreign-family globs use the "**/" recursive forms on purpose: in a monorepo a package-local
// source such as packages/web/.cursorrules or apps/api/.windsurf/rules/ must be detected, not
// only a root-level one. `family` "claude" marks native sources; any other family forces migrate.
const PATTERNS = [
  // Claude / AGENTS.md (native). CLAUDE.local.md and .claude/** stay root-anchored on purpose:
  // local memory and the standard's own .claude/ tree live at the repo root.
  { family: "claude", pattern: "CLAUDE.md" },
  { family: "claude", pattern: "CLAUDE.local.md" },
  { family: "claude", pattern: "**/CLAUDE.md" },
  { family: "claude", pattern: "AGENTS.md" },
  { family: "claude", pattern: "**/AGENTS.md" },
  { family: "claude", pattern: ".claude/**" },
  // Cursor (recursive: also finds packages/<pkg>/.cursorrules and nested .cursor/rules/)
  { family: "cursor", pattern: "**/.cursorrules" },
  { family: "cursor", pattern: "**/.cursor/rules/**/*.mdc" },
  // GitHub Copilot
  { family: "copilot", pattern: "**/.github/copilot-instructions.md" },
  {
    family: "copilot",
    pattern: "**/.github/instructions/**/*.instructions.md",
  },
  // Windsurf
  { family: "windsurf", pattern: "**/.windsurfrules" },
  { family: "windsurf", pattern: "**/.windsurf/rules/**/*" },
  // Gemini
  { family: "gemini", pattern: "GEMINI.md" },
  { family: "gemini", pattern: "**/GEMINI.md" },
  // Cline
  { family: "cline", pattern: "**/.clinerules" },
  { family: "cline", pattern: "**/.clinerules/**/*" },
];

const FOREIGN_FAMILIES = new Set([
  "cursor",
  "copilot",
  "windsurf",
  "gemini",
  "cline",
]);

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function isFile(abs) {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

function isDir(abs) {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

function readJsonSafe(abs) {
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

function readTextSafe(abs) {
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

// Recursively list every file under `dirAbs`, returning POSIX-relative paths to `rootAbs`.
function walkFiles(dirAbs, rootAbs, out) {
  let entries;
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const childAbs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      walkFiles(childAbs, rootAbs, out);
    } else if (entry.isFile()) {
      out.push(toPosix(path.relative(rootAbs, childAbs)));
    }
  }
}

// Recursively collect every directory under `dirAbs` as an absolute path
// (excludes EXCLUDED_DIRS). Used to resolve "**/"-prefixed directory globs.
function walkDirs(dirAbs, out) {
  let entries;
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || EXCLUDED_DIRS.has(entry.name)) continue;
    const childAbs = path.join(dirAbs, entry.name);
    out.push(childAbs);
    walkDirs(childAbs, out);
  }
}

// Resolve the base-directory portion of a pattern that contains a "/**" segment.
// `base` is either a literal relative dir ("dir/sub") or a "**/"-prefixed suffix
// ("**/.cursor/rules"), meaning "any directory whose path ends with .cursor/rules".
function resolveBaseDirs(base, rootAbs) {
  if (base.startsWith("**/")) {
    const suffix = base.slice(3);
    const dirsAbs = [];
    walkDirs(rootAbs, dirsAbs);
    const matched = [];
    for (const dAbs of dirsAbs) {
      const rel = toPosix(path.relative(rootAbs, dAbs));
      if (rel === suffix || rel.endsWith("/" + suffix)) matched.push(dAbs);
    }
    return matched;
  }
  const abs = path.join(rootAbs, base);
  return isDir(abs) ? [abs] : [];
}

// Resolve one pattern against the target dir; returns an array of POSIX-relative file paths.
function resolvePattern(pattern, rootAbs) {
  // Patterns containing a "/**" recursive segment: "<base>/**", "<base>/**/*", "<base>/**/*.ext".
  const starStarIdx = pattern.indexOf("/**");
  if (starStarIdx !== -1) {
    const base = pattern.slice(0, starStarIdx);
    const tail = pattern.slice(starStarIdx + 3); // after "/**"
    const all = [];
    for (const baseAbs of resolveBaseDirs(base, rootAbs)) {
      walkFiles(baseAbs, rootAbs, all);
    }
    let files = all;
    if (tail.startsWith("/*.")) {
      const suffix = tail.slice(2); // ".ext" (may contain dots)
      files = all.filter((p) => p.endsWith(suffix));
    }
    return [...new Set(files)];
  }

  // "**/<rest>" with no further "/**" segment.
  if (pattern.startsWith("**/")) {
    const rest = pattern.slice(3);
    const all = [];
    walkFiles(rootAbs, rootAbs, all);
    if (!rest.includes("/")) {
      // bare filename search anywhere in the tree
      return all.filter((p) => p.split("/").pop() === rest);
    }
    // path-suffix search: file whose path equals or ends with "/<rest>"
    return all.filter((p) => p === rest || p.endsWith("/" + rest));
  }

  // Literal path.
  const abs = path.join(rootAbs, pattern);
  return isFile(abs) ? [pattern] : [];
}

// ---------------------------------------------------------------------------
// Monorepo / workspace detection (cheap, additive — never required for adoption).
// ---------------------------------------------------------------------------

// Expand workspace globs ("packages/*", "apps/web", "libs/**") to concrete POSIX-relative
// dirs. Only the common "<parent>/<glob>" shape is expanded (immediate children of the
// last literal parent segment); the model refines per-package specifics from each manifest.
function expandWorkspaceGlobs(globs, rootAbs) {
  const out = new Set();
  for (const raw of globs) {
    if (typeof raw !== "string") continue;
    const g = raw.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!g) continue;
    if (!g.includes("*")) {
      if (isDir(path.join(rootAbs, g))) out.add(g);
      continue;
    }
    const parentSegs = [];
    for (const seg of g.split("/")) {
      if (seg.includes("*")) break;
      parentSegs.push(seg);
    }
    const parentRel = parentSegs.join("/");
    const parentAbs = parentRel ? path.join(rootAbs, parentRel) : rootAbs;
    let entries;
    try {
      entries = fs.readdirSync(parentAbs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || EXCLUDED_DIRS.has(e.name)) continue;
      out.add(parentRel ? parentRel + "/" + e.name : e.name);
    }
  }
  return [...out];
}

// Read the cheap, well-known workspace declarations. Returns { marker, globs }.
function readWorkspaceGlobs(rootAbs) {
  const globs = [];
  let marker = false;

  // npm / yarn / bun workspaces in package.json (array or { packages: [...] }).
  const pkg = readJsonSafe(path.join(rootAbs, "package.json"));
  if (pkg && pkg.workspaces) {
    marker = true;
    const ws = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : Array.isArray(pkg.workspaces.packages)
        ? pkg.workspaces.packages
        : [];
    for (const g of ws) if (typeof g === "string") globs.push(g);
  }

  // pnpm-workspace.yaml — minimal "packages:" YAML list parser (no yaml dependency).
  const pnpm = readTextSafe(path.join(rootAbs, "pnpm-workspace.yaml"));
  if (pnpm != null) {
    marker = true;
    let inPackages = false;
    for (const rawLine of pnpm.split(/\r?\n/)) {
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
  const lerna = readJsonSafe(path.join(rootAbs, "lerna.json"));
  if (lerna) {
    marker = true;
    if (Array.isArray(lerna.packages))
      for (const g of lerna.packages) if (typeof g === "string") globs.push(g);
  }

  // nx.json / turbo.json — markers only (no explicit package globs here).
  if (isFile(path.join(rootAbs, "nx.json"))) marker = true;
  if (isFile(path.join(rootAbs, "turbo.json"))) marker = true;

  return { marker, globs };
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
    } else if (
      e.isDirectory() &&
      !EXCLUDED_DIRS.has(e.name) &&
      !e.name.startsWith(".")
    ) {
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

// Immediate child directories of `parentRel` (relative to root) that look like projects.
// `parentRel` of "" enumerates the repo root's own top-level directories.
function projectChildren(parentRel, rootAbs) {
  const parentAbs = parentRel ? path.join(rootAbs, parentRel) : rootAbs;
  let entries;
  try {
    entries = fs.readdirSync(parentAbs, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || EXCLUDED_DIRS.has(e.name) || e.name.startsWith("."))
      continue;
    const childRel = parentRel ? parentRel + "/" + e.name : e.name;
    if (looksLikeProjectDir(path.join(rootAbs, childRel))) out.push(childRel);
  }
  return out;
}

// Resolve concrete workspace package roots, plus a boolean monorepo flag. Detection
// degrades gracefully: explicit workspace declarations first, then conventional parents,
// then a marker-less heuristic for repos that are "just folders" with no workspace tool.
function detectWorkspaces(rootAbs) {
  const { marker, globs } = readWorkspaceGlobs(rootAbs);
  const roots = new Set(expandWorkspaceGlobs(globs, rootAbs));

  // Fallback 1: conventional parents (packages/ apps/ services/ libs/ …), with OR without
  // a workspace marker — the parent NAME is the signal, so ≥1 project child is enough.
  if (roots.size === 0) {
    for (const base of WORKSPACE_PARENTS) {
      if (!isDir(path.join(rootAbs, base))) continue;
      for (const child of projectChildren(base, rootAbs)) roots.add(child);
    }
  }

  // Fallback 2 (marker-less): several sibling project folders at the repo root, even with
  // no workspace manager and no packages/ parent — e.g. api/, webapp/, emails/,
  // infrastructure/, a flutter wrapper. Require ≥2 so an ordinary app with one nested
  // sub-project (functions/, examples/) is not misread as a monorepo.
  let markerless = false;
  if (roots.size === 0 && !marker) {
    const top = projectChildren("", rootAbs);
    if (top.length >= 2) {
      top.forEach((r) => roots.add(r));
      markerless = true;
    }
  }

  const workspaceRoots = [...roots].sort();
  return {
    isMonorepo: marker || markerless || workspaceRoots.length > 0,
    workspaceRoots,
  };
}

// Longest-prefix match: the nearest workspace root that contains `relPath`, else null.
function nearestWorkspaceRoot(relPath, workspaceRoots) {
  let best = null;
  for (const root of workspaceRoots) {
    if (relPath === root || relPath.startsWith(root + "/")) {
      if (best === null || root.length > best.length) best = root;
    }
  }
  return best;
}

function detect(targetDir) {
  const rootAbs = path.resolve(targetDir);
  const seen = new Set(); // "family relpath"
  const sources = [];

  const { isMonorepo, workspaceRoots } = detectWorkspaces(rootAbs);

  for (const { family, pattern } of PATTERNS) {
    const matches = resolvePattern(pattern, rootAbs);
    for (const rel of matches) {
      const key = family + " " + rel;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        family,
        path: rel,
        workspaceRoot: nearestWorkspaceRoot(rel, workspaceRoots),
      });
    }
  }

  // Stable ordering: by family, then path.
  sources.sort((a, b) =>
    a.family === b.family
      ? a.path.localeCompare(b.path)
      : a.family.localeCompare(b.family),
  );

  const hasClaude = sources.some((s) => s.family === "claude");
  const hasForeign = sources.some((s) => FOREIGN_FAMILIES.has(s.family));
  const mode = hasForeign ? "migrate" : "greenfield";

  return {
    targetDir: toPosix(rootAbs),
    sources,
    hasClaude,
    mode,
    isMonorepo,
    workspaceRoots,
  };
}

function main() {
  const targetDir = process.argv[2] || process.cwd();
  const inventory = detect(targetDir);
  process.stdout.write(JSON.stringify(inventory, null, 2) + "\n");
}

main();

export { detect };
