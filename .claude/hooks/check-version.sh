#!/usr/bin/env bash
# check-version.sh — SessionStart hook (all sources; no matcher).
#
# Enforces the soft version floor: Claude Code >= 2.1.160 (where the `ultracode`
# trigger keyword landed and where ultracode stopped being offered on models
# that can't run xhigh). There is NO declarative manifest field for this, so the
# floor is enforced only by (a) the README + plugin description and (b) this
# warn-only hook. SessionStart CANNOT block, so this only WARNS.
#
# The running Claude Code version is NOT present in the hook input JSON (no
# `version` field, no CLAUDE_CODE_VERSION env var), so we shell out to
# `claude --version`. That output format is NOT a stable contract — parse it
# DEFENSIVELY: tolerate extra text, prefixes, suffixes, and a missing binary.
# If the version can't be determined for any reason, exit 0 silently (never
# nag on uncertainty, never fail the session).
set -uo pipefail

PLUGIN_NAME="claude-code-architecture-example"

# Minimum supported version components.
MIN_MAJOR=2
MIN_MINOR=1
MIN_PATCH=160

# --- Obtain a version string defensively -----------------------------------
# `claude` may be absent, on a different name, or print banner text. Capture
# stdout+stderr, never let a failure abort the script.
raw=""
if command -v claude >/dev/null 2>&1; then
  raw="$(claude --version 2>/dev/null || true)"
fi

# Nothing to parse → bail silently.
if [ -z "$raw" ]; then
  exit 0
fi

# Extract the FIRST semver-looking token (X.Y.Z), ignoring surrounding text
# such as "Claude Code 2.1.160 (build …)" or a leading "v".
ver="$(printf '%s' "$raw" \
  | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' \
  | head -n 1 || true)"

if [ -z "$ver" ]; then
  # Couldn't find a semver → can't decide → stay silent.
  exit 0
fi

# Split into numeric components.
major="${ver%%.*}"
rest="${ver#*.}"
minor="${rest%%.*}"
patch="${rest#*.}"

# Guard against any non-numeric leakage (defensive; should not happen).
case "$major$minor$patch" in
  *[!0-9]*) exit 0 ;;
esac

# --- Compare to the floor (numeric major/minor/patch) -----------------------
below_floor=0
if   [ "$major" -lt "$MIN_MAJOR" ]; then below_floor=1
elif [ "$major" -eq "$MIN_MAJOR" ]; then
  if   [ "$minor" -lt "$MIN_MINOR" ]; then below_floor=1
  elif [ "$minor" -eq "$MIN_MINOR" ] && [ "$patch" -lt "$MIN_PATCH" ]; then below_floor=1
  fi
fi

if [ "$below_floor" -ne 1 ]; then
  # On or above the floor → nothing to say.
  exit 0
fi

# --- Warn only (cannot block on SessionStart) -------------------------------
msg="${PLUGIN_NAME} requires Claude Code >= ${MIN_MAJOR}.${MIN_MINOR}.${MIN_PATCH} for /effort ultracode features; you are on ${ver}. Update, or use /effort xhigh."

if command -v jq >/dev/null 2>&1; then
  jq -n --arg msg "$msg" '{systemMessage: $msg}'
else
  # No jq: the message contains no characters requiring JSON escaping.
  printf '{"systemMessage":"%s"}\n' "$msg"
fi

exit 0
