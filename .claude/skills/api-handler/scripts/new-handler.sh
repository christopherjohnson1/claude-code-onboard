#!/usr/bin/env bash
# new-handler.sh — print a TypeScript API-handler scaffold to STDOUT.
#
# This script NEVER writes a file. It only prints a stub so the caller stays in
# control of what lands on disk. Copy the relevant parts into
#   src/api/handlers/<handler-name>.ts
# and adapt them. See ../REFERENCE.md for the full conventions.
#
# Usage: bash new-handler.sh <handler-name>
#   e.g. bash new-handler.sh orders

set -euo pipefail

if [ "$#" -lt 1 ] || [ -z "${1:-}" ]; then
  echo "usage: new-handler.sh <handler-name>   (e.g. new-handler.sh orders)" >&2
  exit 1
fi

# Raw resource name as the user typed it (used for the file path hint).
name="$1"

# Lowercase, strip anything that is not a letter/digit so it is a safe
# identifier base. (tr is available on every POSIX shell; bash 3.2 friendly.)
clean="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')"

if [ -z "$clean" ]; then
  echo "error: handler name '$name' has no usable letters/digits" >&2
  exit 1
fi

# PascalCase: uppercase the first character, keep the rest.
first="$(printf '%s' "$clean" | cut -c1 | tr '[:lower:]' '[:upper:]')"
rest="$(printf '%s' "$clean" | cut -c2-)"
Pascal="${first}${rest}"

# Emit the scaffold to stdout only. Action-verb named exports, explicit return
# types, validation at the boundary, sentinel `undefined` for not-found —
# matching src/api/handlers/users.ts. Replace the in-memory fixture with a
# src/lib/* call for real work.
cat <<EOF
// src/api/handlers/${clean}.ts
//
// Scaffold for the "${clean}" API handler. Handlers stay thin: validate input,
// delegate real work to src/lib/*, return a typed result. Named exports only;
// strict TypeScript, 2-space indent. See .claude/skills/api-handler/REFERENCE.md.

export interface ${Pascal} {
  id: string;
}

// In-memory fixture keeps the scaffold runnable with zero setup. Replace with a
// src/lib/* call once you have real data.
const ${clean}: ReadonlyArray<${Pascal}> = [{ id: "1" }];

// Collection handler: explicit return type, no input to validate.
export function list${Pascal}(): ${Pascal}[] {
  return ${clean}.map((item) => ({ ...item }));
}

// Lookup handler: validate input at the boundary; return undefined when nothing
// matches so callers handle "not found" with one consistent convention.
export function get${Pascal}(id: string): ${Pascal} | undefined {
  if (!id) {
    return undefined;
  }
  return ${clean}.find((item) => item.id === id);
}
EOF
