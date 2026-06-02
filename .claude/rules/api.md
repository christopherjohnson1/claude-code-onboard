---
paths:
  - "src/api/**"
---

# API handler conventions

<!-- This file carries `paths:` frontmatter (a YAML list of globs, per the live docs).
     A path-scoped rule loads only when Claude reads files matching the pattern — here,
     anything under src/api/ — so these conventions stay out of context until you touch
     the API layer. Contrast with code-style.md, which has no `paths:` and is always loaded. -->

These rules apply only when you are working on files under `src/api/` (they load on
demand via the `paths:` frontmatter above). API handlers live in
`src/api/handlers/`.

## Structure

- One handler per concern, in its own file under `src/api/handlers/`
  (e.g. `src/api/handlers/users.ts`).
- **Named-export each handler.** No default exports — a file may export more than one
  handler, and named exports keep call sites explicit.

## Inputs

- **Validate every input at the boundary** before using it. Never trust the request
  shape — parse and check it, and reject malformed input with a typed error rather than
  letting it flow downstream.
- Treat all external data as untrusted until validated.

## Outputs

- **Return typed results.** Give each handler an explicit return type; do not rely on
  inference at the API boundary. Callers and tests depend on a stable, documented shape.
- Use the standard error/response shape consistently across handlers so clients can
  rely on it.

## Secrets

- **No secrets in code.** Never hardcode API keys, tokens, connection strings, or
  credentials in handlers. Read them from the environment (`process.env`) at runtime.
- Secret-bearing files (`.env*`) are denied by `settings.json` permissions and protected
  by the `protect-files` hook — keep it that way; do not work around it.
