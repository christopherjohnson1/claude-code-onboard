#!/usr/bin/env bash
# no-rm-rf.sh — PreToolUse hook, matcher "Bash".
#
# Demonstrates the v2.1.85+ hook `if` field. In settings.json this hook is wired
# with an `if` condition so Claude Code only invokes it when the proposed Bash
# command matches a permission-style pattern — i.e. the wiring looks like:
#
#   "PreToolUse": [
#     { "matcher": "Bash",
#       "hooks": [
#         { "type": "command",
#           "if": "Bash(rm -rf *)",                       <-- v2.1.85+ `if` field
#           "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/no-rm-rf.sh" }
#       ] }
#   ]
#
# The `if` field pre-filters using the same matcher grammar as permissions
# (space-boundary, `*` wildcard), so the script body only runs for `rm -rf …`
# commands. We still emit the deny ourselves so the guardrail is explicit and
# self-contained even if the `if` grammar shifts.
#
# Output contract: this hook EMITS a JSON object with
#   hookSpecificOutput.permissionDecision = "deny"
# and a permissionDecisionReason. It uses the JSON form ONLY — it does NOT also
# `exit 2`. (Mixing exit 2 with JSON is the discipline violation we avoid;
# protect-files.sh uses the stderr+exit-2 form instead.)
set -euo pipefail

# Read stdin (hook input JSON).
input="$(cat 2>/dev/null || true)"

# Extract the proposed shell command: .tool_input.command
command_str=""
if command -v jq >/dev/null 2>&1; then
  command_str="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
fi
if [ -z "$command_str" ]; then
  command_str="$(printf '%s' "$input" \
    | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -n 1 \
    | sed -E 's/.*"command"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/' 2>/dev/null || true)"
fi

# Defense-in-depth: detect `rm` with combined recursive+force flags, regardless
# of flag order (rm -rf, rm -fr, rm -r -f, rm --recursive --force, …). The `if`
# wiring already narrows to rm -rf, but we re-check so the script is correct on
# its own. If it's not a dangerous rm, allow (exit 0, no output).
is_dangerous=0
if printf '%s' "$command_str" | grep -Eq '(^|[[:space:];&|])rm([[:space:]]+(-[a-zA-Z]*|--[a-z-]+))*[[:space:]]'; then
  # It's an rm invocation with flags — check for recursive AND force.
  has_recursive=0
  has_force=0
  printf '%s' "$command_str" | grep -Eq '(^|[[:space:]])-[a-zA-Z]*r|(^|[[:space:]])--recursive' && has_recursive=1
  printf '%s' "$command_str" | grep -Eq '(^|[[:space:]])-[a-zA-Z]*f|(^|[[:space:]])--force'     && has_force=1
  if [ "$has_recursive" -eq 1 ] && [ "$has_force" -eq 1 ]; then
    is_dangerous=1
  fi
fi

if [ "$is_dangerous" -ne 1 ]; then
  # Not a recursive-force rm → no opinion, allow.
  exit 0
fi

# Deny via JSON. Build the reason, then emit the permissionDecision object.
reason="Refusing 'rm -rf': recursive force-delete is irreversible and easy to misfire. Delete specific paths explicitly, or move them to a trash dir, instead."

if command -v jq >/dev/null 2>&1; then
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
else
  # No jq: emit the same JSON by hand. The reason text has no characters that
  # require JSON escaping, so a literal here-doc is safe.
  cat <<JSON
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"${reason}"}}
JSON
fi

# JSON form only — do NOT exit 2 here.
exit 0
