/**
 * Tiny entry point that wires the example handler and formatting helpers
 * together. NodeNext module resolution requires explicit `.js` extensions on
 * relative imports, even though the sources are `.ts` — that is what lets
 * `tsc --noEmit` pass and the compiled output run under Node ESM.
 */

import { getUser, listUsers, type User } from "./api/handlers/users.js";
import { formatCurrency, toTitleCase } from "./lib/format.js";

/**
 * Render a one-line summary for a single user, including a demo balance so the
 * `formatCurrency` helper is exercised end-to-end.
 */
export function describeUser(user: User, balanceCents: number): string {
  return `${toTitleCase(user.name)} <${user.email}> — balance ${formatCurrency(balanceCents)}`;
}

/**
 * Build the demo report shown by `main()`. Returned as an array of lines so it
 * is easy to assert against or reuse without touching stdout.
 */
export function buildReport(): string[] {
  const lines: string[] = [];
  for (const user of listUsers()) {
    lines.push(describeUser(user, user.id * 1000));
  }
  const ada = getUser(1);
  if (ada) {
    lines.push(`Lookup by id 1 -> ${ada.name}`);
  }
  return lines;
}

export function main(): void {
  for (const line of buildReport()) {
    // eslint-disable-next-line no-console -- demo entry point prints its report
    console.log(line);
  }
}

main();
