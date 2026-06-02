#!/usr/bin/env node
// restore.mjs — Replay an adoption manifest in REVERSE to undo /adopt-ai-rules (§6.6).
//
// Invocation:
//   node restore.mjs <timestamp> [targetDir]
//
//   <timestamp> The adoption snapshot directory name (== manifest.adoptionId).
//               Use list-backups.mjs to find it. Required.
//   [targetDir] Project root containing .claude/.adopt-backups. Optional;
//               defaults to $CLAUDE_PROJECT_DIR, then process.cwd().
//
// Reads .claude/.adopt-backups/<timestamp>/manifest.json — the EXACT shape written by
// backup.mjs (field names kept identical):
//   { adoptionId, createdAt, mode, pluginVersion, sources,
//     operations:[{ path, op:"create|modify|delete", backupPath, sha256Before, sha256After }] }
//
// Reverse semantics (process operations in reverse order):
//   - op "create": the adoption CREATED this file  -> DELETE it.
//   - op "modify": the adoption OVERWROTE it        -> RESTORE from backupPath (files/<rel>).
//   - op "delete": the adoption REMOVED it          -> RESTORE from backupPath (files/<rel>).
// Then prune now-empty directories the adoption introduced, and append every action to revert.log.
// Git-independent: relies solely on the snapshot, never on VCS state.
//
// Pure Node ESM. Uses only node:fs and node:path. No npm deps. Cross-platform.

import fs from "node:fs";
import path from "node:path";

function resolveTargetDir() {
  return path.resolve(
    process.argv[3] || process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  );
}

function fileExists(abs) {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

function dirExists(abs) {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

function ensureDir(abs) {
  fs.mkdirSync(abs, { recursive: true });
}

function relToAbs(targetDir, rel) {
  // rel uses POSIX slashes in the manifest; split and rejoin for the host platform.
  return path.join(targetDir, ...rel.split("/"));
}

// Prune empty directories from `startAbs` upward, but never above `stopAbs`.
function pruneEmptyDirsUpward(startAbs, stopAbs, log) {
  let cur = startAbs;
  const stop = path.resolve(stopAbs);
  while (true) {
    const resolved = path.resolve(cur);
    if (resolved === stop) break;
    if (!resolved.startsWith(stop + path.sep)) break;
    if (!dirExists(resolved)) {
      cur = path.dirname(resolved);
      continue;
    }
    let contents;
    try {
      contents = fs.readdirSync(resolved);
    } catch {
      break;
    }
    if (contents.length > 0) break;
    try {
      fs.rmdirSync(resolved);
      log.push("prune-dir   " + path.relative(stop, resolved).split(path.sep).join("/"));
    } catch {
      break;
    }
    cur = path.dirname(resolved);
  }
}

function main() {
  const timestamp = process.argv[2];
  if (!timestamp) {
    process.stderr.write(
      "restore.mjs: missing <timestamp> argument.\n" +
        "Usage: node restore.mjs <timestamp> [targetDir]\n" +
        "Run list-backups.mjs to see available snapshots.\n",
    );
    process.exit(1);
  }

  const targetDir = resolveTargetDir();
  const backupDir = path.join(targetDir, ".claude", ".adopt-backups", timestamp);
  const manifestPath = path.join(backupDir, "manifest.json");

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    process.stderr.write(
      "restore.mjs: cannot read manifest at " + manifestPath + ": " + err.message + "\n",
    );
    process.exit(1);
  }

  const operations = Array.isArray(manifest.operations) ? manifest.operations : [];
  const log = [];
  const startedAt = new Date().toISOString();
  log.push("=== restore " + timestamp + " @ " + startedAt + " ===");

  // Replay in REVERSE order so nested creates are undone before their parents are pruned.
  for (let i = operations.length - 1; i >= 0; i--) {
    const operation = operations[i];
    const rel = operation.path;
    const op = operation.op;
    if (!rel || (op !== "create" && op !== "modify" && op !== "delete")) {
      log.push("skip        invalid operation: " + JSON.stringify(operation));
      continue;
    }
    const destAbs = relToAbs(targetDir, rel);

    if (op === "create") {
      // Undo a create -> delete the file the adoption added.
      if (fileExists(destAbs)) {
        try {
          fs.unlinkSync(destAbs);
          log.push("delete      " + rel);
        } catch (err) {
          log.push("error       delete " + rel + ": " + err.message);
        }
      } else {
        log.push("noop        " + rel + " (created file already absent)");
      }
      pruneEmptyDirsUpward(path.dirname(destAbs), targetDir, log);
      continue;
    }

    // op "modify" or "delete" -> restore the verbatim backup copy.
    if (!operation.backupPath) {
      log.push("noop        " + rel + " (no backup recorded for " + op + ")");
      continue;
    }
    const backupAbs = path.join(backupDir, ...operation.backupPath.split("/"));
    if (!fileExists(backupAbs)) {
      log.push("error       missing backup file " + operation.backupPath + " for " + rel);
      continue;
    }
    try {
      ensureDir(path.dirname(destAbs));
      fs.copyFileSync(backupAbs, destAbs);
      log.push("restore     " + rel + "  (from " + operation.backupPath + ")");
    } catch (err) {
      log.push("error       restore " + rel + ": " + err.message);
    }
  }

  log.push("=== done " + new Date().toISOString() + " ===");

  // Append actions to revert.log.
  try {
    fs.appendFileSync(path.join(backupDir, "revert.log"), log.join("\n") + "\n");
  } catch (err) {
    process.stderr.write("restore.mjs: could not append revert.log: " + err.message + "\n");
  }

  process.stdout.write(log.join("\n") + "\n");
}

main();
