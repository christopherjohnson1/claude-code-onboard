#!/usr/bin/env bash
# protect-files.sh — PreToolUse hook, matcher "Edit|Write".
#
# Headline un-bypassable demo: a PreToolUse hook that exits 2 blocks the tool
# call even under bypassPermissions / --dangerously-skip-permissions. This is
# the *only* mechanism that guarantees "must never happen, zero exceptions."
#
# Contract (see hooks docs):
#   - Read the tool-call JSON on stdin.
#   - Extract .tool_input.file_path (the path Edit/Write is about to touch).
#   - If it matches a protected pattern, write a human reason to STDERR and
#     `exit 2`. Exit code 2 = block + feed stderr back to the model.
#   - Otherwise `exit 0` (allow).
#   - NEVER print a JSON permissionDecision here. The discipline rule is:
#     a blocking PreToolUse hook uses EITHER stderr + exit 2 OR a JSON
#     permissionDecision — never both. This script uses the stderr + exit 2
#     form. (no-rm-rf.sh demonstrates the JSON form.)
set -euo pipefail

# Read everything on stdin (the hook input JSON).
input="$(cat 2>/dev/null || true)"

# Extract .tool_input.file_path. Prefer jq when available; otherwise fall back
# to a portable grep/sed extraction so the hook still works on a bare box.
file_path=""
if command -v jq >/dev/null 2>&1; then
  file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
fi
if [ -z "$file_path" ]; then
  # Portable fallback: pull the first "file_path": "<value>" occurrence.
  # Handles common JSON spacing; good enough as a no-jq safety net.
  file_path="$(printf '%s' "$input" \
    | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -n 1 \
    | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/' || true)"
fi

# Nothing to check (e.g. a tool input without file_path) → allow.
if [ -z "$file_path" ]; then
  exit 0
fi

# Normalize: compare on the basename and on the raw path so both
# "/abs/migrations/x.sql" and "migrations/x.sql" are caught.
base="$(basename -- "$file_path")"

# Protected patterns (per spec §5.5):
#   .env*                                       — secrets / local env files at any depth
#   package-lock.json / pnpm-lock.yaml / yarn.lock — lockfiles owned by the package manager
#   .git/                                       — internal git state
#   migrations/                                 — applied DB migrations are immutable history
#   .claude/.adopt-backups/                     — adoption-engine snapshots must not be clobbered
#
# Lockfiles are matched on the BASENAME, so the guard holds at any depth — important in a
# monorepo where each workspace package may carry its own lockfile.
reason=""
case "$base" in
  .env|.env.*) reason="'.env' files hold secrets and are never editable by tools." ;;
  package-lock.json) reason="package-lock.json is managed by npm — run 'npm install' instead of hand-editing." ;;
  pnpm-lock.yaml) reason="pnpm-lock.yaml is managed by pnpm — run 'pnpm install' instead of hand-editing." ;;
  yarn.lock) reason="yarn.lock is managed by yarn — run 'yarn install' instead of hand-editing." ;;
esac

if [ -z "$reason" ]; then
  case "$file_path" in
    */.git/*|.git/*) reason="The .git/ directory is internal git state and must not be edited directly." ;;
    */migrations/*|migrations/*) reason="migrations/ is applied, immutable history — add a NEW migration rather than editing an existing one." ;;
    */.claude/.adopt-backups/*|.claude/.adopt-backups/*) reason="'.claude/.adopt-backups/' holds adoption snapshots used by /revert-ai-rules and must never be modified." ;;
  esac
fi

if [ -n "$reason" ]; then
  # Block: reason → stderr, then exit 2. (No JSON. No stdout.)
  printf 'Blocked write to protected path "%s": %s\n' "$file_path" "$reason" >&2
  exit 2
fi

# Path is not protected → allow the tool call.
exit 0
