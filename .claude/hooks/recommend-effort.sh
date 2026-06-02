#!/usr/bin/env bash
# recommend-effort.sh — UserPromptExpansion hook.
#
# Nudges the user toward `/effort ultracode` exactly once per session, and only
# when one of THIS plugin's slash commands is invoked while session effort is
# below xhigh. A hook can RECOMMEND effort, never SET it; ultracode reports as
# xhigh everywhere a hook can read it, so this gate is best-effort by design.
#
# Why UserPromptExpansion (not PreToolUse): it is the only documented event that
# fires on the user-typed `/command` path AND carries command identity
# (command_name, command_source). Direct `/skillname` typing BYPASSES PreToolUse
# (hooks.md), so a PreToolUse plan would miss the main path.
#
# THREE RUNTIME-UNCONFIRMED BEHAVIORS (doc-unconfirmed; this hook FAILS SAFE =
# do-not-nudge if any is false; enable CC_ARCH_HOOK_DEBUG=1 to capture them on
# first fire):
#   1. $CLAUDE_EFFORT is actually populated for a UserPromptExpansion hook.
#   2. A non-blocking `systemMessage` JSON field renders for this event.
#   3. Whether plugin command_name arrives BARE (e.g. "commit") or NAMESPACED
#      (e.g. "claude-code-onboard:commit"); we match both forms.
#
# Output contract: emit a ONE-TIME nudge via the universal `systemMessage` JSON
# field ONLY. NEVER additionalContext (unsupported on this event), NEVER
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

# LOOSE command_source check: accept plugin (once packaged) OR project/local
# (this dogfooding repo). Do NOT hard-require "plugin". Only reject a source we
# explicitly recognize as foreign; unknown/empty sources pass (fail-open on
# identity since the matcher already scoped us).
case "$command_source" in
  plugin|project|local|""|user) : ;;   # accepted
  *) exit 0 ;;                          # some other recognized origin → skip
esac

# --- (2) Gate on the $CLAUDE_EFFORT env var (NOT effort.level) --------------
# Fail-safe: if effort is already xhigh/max, or is unset/empty (can't tell),
# do NOT nudge. We only nudge when effort is a KNOWN lower tier.
effort="${CLAUDE_EFFORT:-}"
case "$effort" in
  xhigh|max|"") exit 0 ;;               # already elevated or unknown → no nudge
  low|medium|high) : ;;                 # known lower tier → eligible to nudge
  *) exit 0 ;;                          # unrecognized value → fail safe
esac

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
msg="Tip: you invoked a heavy /${norm} command at effort '${effort}'. For the deepest reasoning, run '/effort ultracode' (or '/effort xhigh') for this work. (Shown once per session.)"

if command -v jq >/dev/null 2>&1; then
  jq -n --arg msg "$msg" '{systemMessage: $msg}'
else
  # No jq: the message contains no characters requiring JSON escaping.
  printf '{"systemMessage":"%s"}\n' "$msg"
fi

exit 0
