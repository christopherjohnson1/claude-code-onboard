---
name: api-handler
description: Scaffolds a new HTTP API handler under `src/api/handlers/` following this project's conventions, and can print a ready-to-paste TypeScript handler stub. Use when the user says "add an API endpoint", "create a new handler", "scaffold a route", or "add a handler for <resource>".
argument-hint: "[handler-name]"
---

# Scaffold a new API handler

This skill is the **progressive-disclosure** example: this file stays small and
high-signal; the deep conventions live one level down in
[REFERENCE.md](REFERENCE.md), which you load **only when you actually need the
details**. Read it before writing a handler if you are unsure about the exact
file layout, naming, error shape, or testing expectations.

## Where handlers live

All HTTP API handlers live in **`src/api/handlers/`**, one file per resource
(see `src/api/handlers/users.ts` for the reference implementation). This is the
same rule stated in `CLAUDE.md` and enforced by `.claude/rules/api.md`.

## Quick path

To get a starting point, run the bundled scaffold script. It **prints a handler
stub to stdout** — it never writes a file, so you stay in control of what lands
on disk:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/new-handler.sh" <handler-name>
```

For example, `bash "${CLAUDE_SKILL_DIR}/scripts/new-handler.sh" orders` prints a
TypeScript stub for an `orders` handler. Copy the relevant parts into a new file
at `src/api/handlers/<handler-name>.ts` and adapt it.

> `${CLAUDE_SKILL_DIR}` resolves to this skill's own directory, so the script
> path is correct whether this ships as a plain project skill or, later, as a
> bundled plugin skill.

## Steps

1. **Pick the resource name.** Use the plural noun for collection resources
   (`users`, `orders`). The file is `src/api/handlers/<name>.ts`; the request
   handler is a named export `handle<Name>` (e.g. `handleUsers`).
2. **Generate the stub.** Run the scaffold script above to get a conventional
   starting point.
3. **Fill it in.** Implement the handler against the conventions in
   [REFERENCE.md](REFERENCE.md): validate input, return a typed result, surface
   errors as the standard error shape.
4. **Add a test.** Mirror `tests/format.test.ts`: a sibling `*.test.ts` that
   exercises the handler's behavior, closing the verification loop.
5. **Verify.** Run `npm run typecheck` and `npm test`.

Keep handlers thin — validation and response shaping only. Business logic
belongs in `src/lib/`.
