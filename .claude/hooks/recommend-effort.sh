#!/usr/bin/env bash
# recommend-effort.sh — UserPromptExpansion hook.
#
# Nudges the user toward `/effort ultracode` exactly once per session whenever
# one of THIS plugin's slash commands is typed. A hook can RECOMMEND effort,
# never SET it. NOTE: we do NOT gate on the current effort tier — a live capture
# (2026-06-02) confirmed $CLAUDE_EFFORT is NOT passed to a UserPromptExpansion
# hook (unset in the hook env even when the session was at `high`), so there is
# no reliable way to read it here. We nudge once per session and word the message
# so it never asserts the current tier.
#
# Why UserPromptExpansion (not PreToolUse): it is the only documented event that
# fires on the user-typed `/command` path AND carries command identity
# (command_name, command_source). Direct `/skillname` typing BYPASSES PreToolUse
# (hooks.md), so a PreToolUse plan would miss the main path.
#
# RUNTIME FINDINGS (live capture 2026-06-02 via CC_ARCH_HOOK_DEBUG=1):
#   1. $CLAUDE_EFFORT is NOT populated for a UserPromptExpansion hook (CONFIRMED
#      unset) — so we no longer gate on it; we nudge once per session instead.
#   2. Whether a non-blocking `systemMessage` renders for this event is STILL
#      unverified; CC_ARCH_HOOK_DEBUG=1 keeps logging each fire so it can be seen.
#   3. CONFIRMED: command_name arrives BARE in project form (e.g. "legacy-hello")
#      and command_source as "projectSettings"; we normalize bare/namespaced both.
#
# Output contract: emit a ONE-TIME nudge via the universal `systemMessage` JSON
# field ONLY. `additionalContext` IS supported on this event (per the hooks
# docs) but injects into Claude's context rather than surfacing to the user, so
# we deliberately use `systemMessage` (the user-facing channel). NEVER
# decision:"block"; never mix `exit 2` with JSON.
set -uo pipefail

# Bare base-names of this plugin's slash commands (must match settings.json
# matcher). command_name may arrive bare or "<plugin>:<base>"; we match both.
COMMANDS="adopt-ai-rules revert-ai-rules recommend-plugins fix-issue commit api-handler legacy-hello"

# --- (0) Read stdin JSON ----------------------------------------------------
input="$(cat 2>/dev/null || true)"

# Helper: pull a top-level string field by name (jq preferred, grep/sed fallback).
json_field() {
  local key="$1" out=""
  if command -v jq >/dev/null 2>&1; then
    out="$(printf '%s' "$input" | jq -r --arg k "$key" '.[$k] // empty' 2>/dev/null || true)"
  fi
  if [ -z "$out" ]; then
    out="$(printf '%s' "$input" \
      | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
      | head -n 1 \
      | sed -E "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/" 2>/dev/null || true)"
  fi
  printf '%s' "$out"
}

command_name="$(json_field command_name)"
command_source="$(json_field command_source)"
session_id="$(json_field session_id)"

# --- Quiet logging mode (for verifying the 3 unconfirmed behaviors) ---------
# CC_ARCH_HOOK_DEBUG=1 appends the raw stdin + resolved fields to a log file so
# the doc-unconfirmed behaviors can be inspected on first fire. Never fails.
if [ "${CC_ARCH_HOOK_DEBUG:-}" = "1" ]; then
  log_dir="${CLAUDE_PLUGIN_DATA:-${TMPDIR:-/tmp}}"
  log_file="${log_dir%/}/cc-arch.recommend-effort.log"
  {
    printf '=== %s ===\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date)"
    printf 'CLAUDE_EFFORT=%s\n' "${CLAUDE_EFFORT:-<unset>}"
    printf 'resolved command_name=%s\n' "${command_name:-<empty>}"
    printf 'resolved command_source=%s\n' "${command_source:-<empty>}"
    printf 'resolved session_id=%s\n' "${session_id:-<empty>}"
    printf 'raw stdin:\n%s\n' "$input"
  } >>"$log_file" 2>/dev/null || true
fi

# --- (1) Scope by command_name (matcher) + LOOSE command_source -------------
# Normalize command_name: strip a leading "<plugin>:" namespace if present, and
# a leading "/" if present, so "commit", "/commit", and "<plugin>:commit" all
# reduce to "commit".
norm="${command_name#/}"
norm="${norm##*:}"

matched=0
for c in $COMMANDS; do
  if [ "$norm" = "$c" ]; then
    matched=1
    break
  fi
done
# Not one of our commands → silently do nothing.
[ "$matched" -eq 1 ] || exit 0

# command_source is INFORMATIONAL ONLY: the command_name matcher above already
# scoped us to THIS plugin's commands. We accept ALL sources (fail-open, per the
# original stated intent). A previous version rejected unknown sources with
# `*) exit 0`, which silently killed the nudge when the runtime sent the real
# project-form value "projectSettings" — the bug this fix removes. (The value is
# still captured in the debug log above for the record.)

# --- (2) NO effort gate -----------------------------------------------------
# $CLAUDE_EFFORT is not exposed to this event (see RUNTIME FINDINGS above), so
# there is nothing reliable to gate on. We nudge once per session regardless of
# tier; the message (below) is worded so it never asserts the current effort.

# --- (3) Once-per-session marker -------------------------------------------
# CLAUDE_PLUGIN_DATA is persistent/per-plugin once packaged; fall back to TMPDIR
# then /tmp. Keyed by session_id so each session nudges at most once.
marker_dir="${CLAUDE_PLUGIN_DATA:-${TMPDIR:-/tmp}}"
sid="${session_id:-nosession}"
marker="${marker_dir%/}/cc-arch.nudged.${sid}"

if [ -e "$marker" ]; then
  exit 0                                # already nudged this session
fi
# Create the marker BEFORE emitting, so a failure to write means we simply
# (harmlessly) nudge again next time rather than nagging in a loop on success.
( : > "$marker" ) 2>/dev/null || true

# --- (4) Emit the one-time nudge via systemMessage ONLY ---------------------
msg="Tip: you invoked a heavy /${norm} command. For the deepest reasoning, consider running '/effort ultracode' (or '/effort xhigh') for this work. (Shown once per session.)"

if command -v jq >/dev/null 2>&1; then
  jq -n --arg msg "$msg" '{systemMessage: $msg}'
else
  # No jq: the message contains no characters requiring JSON escaping.
  printf '{"systemMessage":"%s"}\n' "$msg"
fi

exit 0
