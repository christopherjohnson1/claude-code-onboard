#!/usr/bin/env bash
# session-context.sh — SessionStart hook, matcher "compact".
#
# Fires when a session resumes after a context compaction. For SessionStart
# hooks, anything written to STDOUT is injected back into the model's context —
# so this is the right place to re-inject the standing reminders that compaction
# may have squeezed out. Plain stdout, exit 0 (SessionStart cannot block).
set -euo pipefail

# Plain text on stdout → reaches the model context on SessionStart.
cat <<'CONTEXT'
Standing project reminders (re-injected after compaction):
- Use npm (not yarn/pnpm) for all package operations.
- Run `npm test` before committing.
- API handlers live in src/api/handlers/.
CONTEXT

exit 0
