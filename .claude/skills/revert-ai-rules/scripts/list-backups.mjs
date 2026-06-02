#!/usr/bin/env node
// list-backups.mjs — List adoption snapshots, newest-first, with a manifest summary (§6.6).
//
// Invocation:
//   node list-backups.mjs [targetDir]
//
//   [targetDir] Project root containing .claude/.adopt-backups. Optional;
//               defaults to $CLAUDE_PROJECT_DIR, then process.cwd().
//
// Reads each .claude/.adopt-backups/<ts>/manifest.json written by backup.mjs and
// prints a summary. The manifest field names MUST stay identical to backup.mjs:
//   { adoptionId, createdAt, mode, pluginVersion, sources, operations:[{path,op,...}] }
//
// Output: human-readable lines to stdout, newest snapshot first. Each line shows the
// timestamp (== restore arg), mode, operation count, and createdAt.
//
// Pure Node ESM. Uses only node:fs and node:path. No npm deps. Cross-platform.

import fs from "node:fs";
import path from "node:path";

function resolveTargetDir() {
  return path.resolve(
    process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  );
}

function readManifest(dirAbs) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dirAbs, "manifest.json"), "utf8"));
    return data;
  } catch {
    return null;
  }
}

function main() {
  const targetDir = resolveTargetDir();
  const backupsRoot = path.join(targetDir, ".claude", ".adopt-backups");

  let entries;
  try {
    entries = fs
      .readdirSync(backupsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    process.stdout.write("No adoption backups found (.claude/.adopt-backups is empty or absent).\n");
    return;
  }

  if (entries.length === 0) {
    process.stdout.write("No adoption backups found (.claude/.adopt-backups is empty).\n");
    return;
  }

  // Directory names are UTC timestamps; lexical sort descending == newest first.
  entries.sort((a, b) => b.localeCompare(a));

  process.stdout.write("Adoption backups (newest first):\n\n");
  for (const ts of entries) {
    const dirAbs = path.join(backupsRoot, ts);
    const manifest = readManifest(dirAbs);
    if (!manifest) {
      process.stdout.write("  " + ts + "  [manifest.json missing or unreadable]\n");
      continue;
    }
    const ops = Array.isArray(manifest.operations) ? manifest.operations.length : 0;
    const mode = manifest.mode || "?";
    const createdAt = manifest.createdAt || "?";
    const version = manifest.pluginVersion || "?";
    process.stdout.write(
      "  " +
        ts +
        "\n" +
        "      mode=" +
        mode +
        "  operations=" +
        ops +
        "  pluginVersion=" +
        version +
        "\n" +
        "      createdAt=" +
        createdAt +
        "\n" +
        "      restore with: node restore.mjs " +
        ts +
        "\n\n",
    );
  }
}

main();
