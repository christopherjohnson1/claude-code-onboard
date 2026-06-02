#!/usr/bin/env bash
# format-on-edit.sh — PostToolUse hook, matcher "Edit|Write".
#
# Cosmetic, non-blocking: after a file is edited or written, run prettier on it.
# PostToolUse runs AFTER the tool already succeeded, so blocking here can't undo
# the write — and we don't want a missing prettier / unsupported file to break
# the user's turn. Therefore this script ALWAYS exits 0 and swallows errors.
#
# Contract:
#   - Read the tool-call JSON on stdin, extract .tool_input.file_path.
#   - If the file exists, run `npx prettier --write` on it.
#   - Guard against: no file_path, missing file, missing prettier/npx.
#   - Never fail the turn — exit 0 no matter what.
#
# NOTE: we deliberately do NOT `set -e` here. A non-zero from prettier/npx must
# not propagate; this hook is best-effort cosmetics only.
#
# MONOREPO NOTE: `npx --no-install prettier` resolves the prettier binary from the
# launch/worktree ROOT, not the edited file's package. Once this standard is adopted into
# a monorepo, every edit is formatted by the root prettier: a package pinned to a different
# prettier MAJOR may see formatting churn, and a package whose prettier lives only in its
# own node_modules will silently no-op under --no-install. Prettier's config still
# auto-discovers per file, so style is correct wherever a binary is found. This is
# consistent with the best-effort, exit-0 contract above — hoist prettier to the workspace
# root for uniform formatting. We deliberately do NOT add per-package binary resolution.
set -uo pipefail

# Read stdin (hook input JSON).
input="$(cat 2>/dev/null || true)"

# Extract .tool_input.file_path (jq preferred, portable fallback otherwise).
file_path=""
if command -v jq >/dev/null 2>&1; then
  file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
fi
if [ -z "$file_path" ]; then
  file_path="$(printf '%s' "$input" \
    | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -n 1 \
    | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/' 2>/dev/null || true)"
fi

# No path, or the file doesn't exist (e.g. a delete) → nothing to format.
if [ -z "$file_path" ] || [ ! -f "$file_path" ]; then
  exit 0
fi

# Need npx to invoke prettier. If npx is unavailable, skip silently.
if ! command -v npx >/dev/null 2>&1; then
  exit 0
fi

# Format the single edited file. --no-install avoids surprise downloads;
# all output is discarded and the exit status is ignored so the turn never
# fails on a formatting hiccup or an unsupported file type.
npx --no-install prettier --write -- "$file_path" >/dev/null 2>&1 || true

exit 0
