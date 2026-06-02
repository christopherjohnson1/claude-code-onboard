/**
 * Example API handler module.
 *
 * Per the project layout rule, API handlers live in `src/api/handlers/`
 * (see `.claude/rules/api.md`, which loads on demand for `src/api/**`).
 *
 * This module is intentionally dependency-free: it uses an in-memory fixture
 * instead of a real database so the example stays runnable with zero setup.
 */

import { toTitleCase } from "../../lib/format.js";

export interface User {
  id: number;
  name: string;
  email: string;
}

const USERS: ReadonlyArray<User> = [
  { id: 1, name: "ada lovelace", email: "ada@example.com" },
  { id: 2, name: "grace hopper", email: "grace@example.com" },
  { id: 3, name: "alan turing", email: "alan@example.com" },
];

/**
 * Normalize a stored user record for presentation (title-cased display name).
 */
function present(user: User): User {
  return { ...user, name: toTitleCase(user.name) };
}

/**
 * Return all users, normalized for presentation.
 */
export function listUsers(): User[] {
  return USERS.map(present);
}

/**
 * Look up a single user by id. Returns `undefined` when no user matches.
 */
export function getUser(id: number): User | undefined {
  const match = USERS.find((user) => user.id === id);
  return match ? present(match) : undefined;
}
