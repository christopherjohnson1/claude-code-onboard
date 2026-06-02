#!/usr/bin/env node
// backup.mjs — Snapshot every path an adoption plan will touch, BEFORE any write (§6.1 step 3, §6.5).
//
// =============================================================================
// PLAN-INPUT INTERFACE (the contract restore.mjs is built against)
// =============================================================================
// Invocation:
//   node backup.mjs <planFile> [targetDir]
//
//   <planFile>  Path to a JSON plan file describing the adoption. Required.
//   [targetDir] Project root the plan paths are relative to. Optional;
//               defaults to $CLAUDE_PROJECT_DIR, then process.cwd().
//
// Plan file shape (authored by the model after detect/mapping, §6.1-6.3):
//   {
//     "mode": "greenfield" | "migrate",          // required
//     "sources": [ { "family": "...", "path": "..." } ],  // detector inventory (optional, copied verbatim)
//     "pluginVersion": "x.y.z",                   // optional; else read from standard-manifest.json
//     "operations": [
//       { "path": "CLAUDE.md", "op": "create" },          // file the adoption will CREATE (must not yet exist)
//       { "path": ".claude/rules/api.md", "op": "modify" }, // file the adoption will OVERWRITE (pre-existing)
//       { "path": ".cursorrules", "op": "delete" }          // file the adoption will REMOVE (pre-existing)
//     ]
//   }
//
// Each plan operation needs only { path, op }. backup.mjs computes everything else
// (backupPath, sha256Before, sha256After) and WRITES the manifest. `path` is
// relative to targetDir and uses POSIX slashes in the output manifest.
//
// =============================================================================
// OUTPUT — exact §6.5 manifest shape (restore.mjs reads these field names verbatim)
// =============================================================================
// .claude/.adopt-backups/<UTC-timestamp>/
//   manifest.json:
//     {
//       "adoptionId":    "<UTC-timestamp>",          // == the backup dir name
//       "createdAt":     "<ISO8601>",                // stamped at runtime
//       "mode":          "greenfield" | "migrate",
//       "pluginVersion": "<from plan or standard-manifest.json or '0.0.0'>",
//       "sources":       [ { family, path } ],        // detector inventory, verbatim
//       "operations": [
//         { "path": "<rel>", "op": "create|modify|delete",
//           "backupPath": "files/<rel>" | null,       // null for op:create (nothing pre-existed)
//           "sha256Before": "<hex>" | null,           // null when the file did not pre-exist
//           "sha256After":  null }                    // backup runs BEFORE apply, so After is always null here
//       ]
//     }
//   files/ — verbatim copies of every pre-existing modify/delete target (mirrors the rel path).
//   revert.log — created empty; appended to by restore.mjs.
//
// NOTE on sha256After: backup runs before the apply step, so the post-write hash is
// unknown at backup time and is recorded as null. The field exists to match the §6.5
// schema; the apply/report step may fill it later. restore.mjs does not depend on it.
//
// Pure Node ESM. Uses only node:fs, node:path, node:crypto. No npm deps. Cross-platform.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_DIR = path.resolve(SKILL_DIR, "..");

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function fileExists(abs) {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

function sha256OfFile(abs) {
  const buf = fs.readFileSync(abs);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// UTC timestamp safe for a directory name: 2026-06-02T14-30-05-123Z
function utcTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function readPluginVersion() {
  try {
    const manifestPath = path.join(MANIFEST_DIR, "standard-manifest.json");
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (typeof data.pluginVersion === "string") return data.pluginVersion;
  } catch {
    // fall through to default
  }
  return "0.0.0";
}

function ensureDir(abs) {
  fs.mkdirSync(abs, { recursive: true });
}

function copyVerbatim(srcAbs, destAbs) {
  ensureDir(path.dirname(destAbs));
  fs.copyFileSync(srcAbs, destAbs);
}

function main() {
  const planFile = process.argv[2];
  if (!planFile) {
    process.stderr.write(
      "backup.mjs: missing <planFile> argument.\n" +
        "Usage: node backup.mjs <planFile> [targetDir]\n",
    );
    process.exit(1);
  }

  const targetDir = path.resolve(
    process.argv[3] || process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  );

  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(path.resolve(planFile), "utf8"));
  } catch (err) {
    process.stderr.write(
      "backup.mjs: cannot read/parse plan file: " + err.message + "\n",
    );
    process.exit(1);
  }

  const mode =
    plan.mode === "greenfield" || plan.mode === "migrate"
      ? plan.mode
      : "migrate";
  const sources = Array.isArray(plan.sources) ? plan.sources : [];
  const pluginVersion =
    typeof plan.pluginVersion === "string"
      ? plan.pluginVersion
      : readPluginVersion();
  const planOps = Array.isArray(plan.operations) ? plan.operations : [];

  const now = new Date();
  const adoptionId = utcTimestamp(now);
  const createdAt = now.toISOString();

  const backupRoot = path.join(
    targetDir,
    ".claude",
    ".adopt-backups",
    adoptionId,
  );
  const filesRoot = path.join(backupRoot, "files");
  ensureDir(backupRoot);

  const operations = [];
  for (const rawOp of planOps) {
    const rel = toPosix(String(rawOp.path || "").trim());
    const op = rawOp.op;
    if (!rel) continue;
    if (op !== "create" && op !== "modify" && op !== "delete") {
      process.stderr.write(
        "backup.mjs: skipping operation with invalid op (" +
          JSON.stringify(rawOp) +
          ")\n",
      );
      continue;
    }

    const srcAbs = path.join(targetDir, rel);
    const preExists = fileExists(srcAbs);

    let backupPath = null;
    let sha256Before = null;

    if (op === "modify" || op === "delete") {
      // These operate on a pre-existing file: snapshot it verbatim so restore can put it back.
      if (preExists) {
        sha256Before = sha256OfFile(srcAbs);
        backupPath = "files/" + rel;
        copyVerbatim(srcAbs, path.join(filesRoot, ...rel.split("/")));
      } else {
        // Planned modify/delete of a file that isn't there: record but nothing to back up.
        process.stderr.write(
          "backup.mjs: warning — planned " +
            op +
            " of missing file: " +
            rel +
            "\n",
        );
      }
    }
    // op === "create": nothing pre-exists to back up (backupPath/sha256Before stay null).
    // If a file is unexpectedly already there for a create, the plan is inconsistent:
    // warn loudly so the model resolves it before applying. We deliberately do NOT
    // record a lone sha256Before with no verbatim copy — that would be a false sense of
    // safety, since restore.mjs treats a "create" as delete-on-revert and would remove
    // this pre-existing file without a recovery copy.
    if (op === "create" && preExists) {
      process.stderr.write(
        "backup.mjs: warning — planned create of an already-existing file: " +
          rel +
          " (resolve before applying; revert would DELETE this file)\n",
      );
    }

    operations.push({
      path: rel,
      op,
      backupPath,
      sha256Before,
      sha256After: null,
    });
  }

  const manifest = {
    adoptionId,
    createdAt,
    mode,
    pluginVersion,
    sources,
    operations,
  };

  fs.writeFileSync(
    path.join(backupRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  // revert.log placeholder, appended to by restore.mjs.
  fs.writeFileSync(
    path.join(backupRoot, "revert.log"),
    "# revert.log — appended by /revert-ai-rules restore.mjs\n",
  );

  // Report the backup location and adoptionId for the skill workflow.
  process.stdout.write(
    JSON.stringify(
      {
        adoptionId,
        backupDir: toPosix(path.relative(targetDir, backupRoot)),
        manifestPath: toPosix(
          path.relative(targetDir, path.join(backupRoot, "manifest.json")),
        ),
        operationCount: operations.length,
      },
      null,
      2,
    ) + "\n",
  );
}

main();
