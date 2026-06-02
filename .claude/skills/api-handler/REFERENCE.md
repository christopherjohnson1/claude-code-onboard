# API handler conventions (deep reference)

This is the deeper reference for the `api-handler` skill. The top-level
[SKILL.md](SKILL.md) links here one level down — read this when you need the
exact conventions for layout, naming, error handling, or testing.

## File layout

```
src/
├── api/
│   └── handlers/
│       ├── users.ts        # reference handler — one file per resource
│       └── <resource>.ts   # new handlers go here, never elsewhere
└── lib/
    └── format.ts           # shared, framework-free business logic
```

- **One file per concern, grouped by resource.** A resource maps to a handler
  file named after it. A single file may export **more than one** handler for
  that resource (see `users.ts`, which exports both `listUsers` and `getUser`).
- **Handlers are thin.** A handler validates input at the boundary, calls into
  `src/lib/` for real work, and shapes the response. No business logic, no data
  access, lives in the handler itself.
- **Shared logic lives in `src/lib/`.** Anything reusable or framework-free
  (formatting, validation helpers, domain rules) belongs there so it can be
  unit-tested in isolation, the way `src/lib/format.ts` is tested by
  `tests/format.test.ts`.

## Naming

| Thing                      | Convention                | Example                     |
| -------------------------- | ------------------------- | --------------------------- |
| File                       | resource noun             | `src/api/handlers/users.ts` |
| Handler export             | action verb + resource    | `listUsers`, `getUser`      |
| Record/entity type         | `PascalCase` singular     | `User`                      |
| Request type (when needed) | `<Verb><Resource>Request` | `CreateUserRequest`         |

- **Named exports only** — no default exports anywhere (project-wide rule). This
  is why a file can hold several handlers: each is reached by an explicit name.
- **2-space indentation, strict TypeScript.** No `any`; give every handler an
  explicit return type — do not rely on inference at the API boundary.
- **Validate every input at the boundary** before using it, and treat all
  external data as untrusted until validated.
- **No secrets in code.** Read keys/tokens/connection strings from
  `process.env` at runtime; never hardcode them (`.env*` is denied by
  `settings.json` and the `protect-files` hook).

## Handler shape

A handler is a thin function: it validates its input, calls into `src/lib/` for
the real work, and returns a typed result. Give it an explicit return type. The
scaffold printed by `scripts/new-handler.sh` follows this shape — and it mirrors
the reference handler `src/api/handlers/users.ts`, which exports `listUsers` and
`getUser` rather than one catch-all function.

```ts
import { toTitleCase } from "../../lib/format.js";

export interface Order {
  id: string;
  customer: string;
}

// A collection handler: explicit return type, delegates formatting to src/lib/.
export function listOrders(): Order[] {
  return load().map((order) => ({
    ...order,
    customer: toTitleCase(order.customer),
  }));
}

// A lookup handler: validate input, return undefined when nothing matches.
export function getOrder(id: string): Order | undefined {
  if (!id) {
    return undefined;
  }
  return load().find((order) => order.id === id);
}
```

(`load()` stands in for a `src/lib/` call; the scaffold uses an in-memory
fixture so the example stays runnable with zero setup, exactly like `users.ts`.)

## Result and error shape

Use one consistent failure convention across handlers so callers and tests can
rely on it. Two patterns fit this repo:

- **Sentinel return** (what `users.ts` uses): return `T | undefined` and let the
  caller treat `undefined` as "not found." Simple, fully typed, no exceptions.
- **Tagged error object**, when the caller needs a machine-readable reason:

  ```ts
  export interface HandlerError {
    error: {
      code: string; // stable, machine-readable, e.g. "invalid_request"
      message: string; // human-readable detail
    };
  }

  export type HandlerResult<T> = T | HandlerError;
  ```

  - **Validation failures** → `code: "invalid_request"`.
  - **Missing resource** → `code: "not_found"`.
  - Keep `code` values stable; tests assert on them.

Pick one convention per handler and stay consistent. Never throw ad hoc strings
across the API boundary.

## Testing

- Add a sibling test file mirroring `tests/format.test.ts` (Vitest). For a
  handler, exercise: a valid request returns the expected typed response, and an
  invalid request returns the standard error shape with the right `code`.
- Run `npm run typecheck` and `npm test` before considering the handler done —
  this closes the verification loop the repo is built around.

## Checklist

- [ ] File at `src/api/handlers/<resource>.ts`, grouped by resource.
- [ ] Action-verb named exports (e.g. `listOrders`, `getOrder`); no default export.
- [ ] Explicit return types; no `any`.
- [ ] Input validated at the boundary; external data treated as untrusted.
- [ ] Failures use one consistent convention (sentinel `undefined` or tagged error).
- [ ] No secrets in code; read them from `process.env`.
- [ ] Business logic delegated to `src/lib/`.
- [ ] Sibling `*.test.ts` covers success and failure paths.
- [ ] `npm run typecheck` and `npm test` pass.
