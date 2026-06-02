/**
 * Small, pure formatting helpers.
 *
 * These exist mainly to give the verification loop (`tests/format.test.ts`)
 * something real to assert against. Keep every export pure and dependency-free
 * so the sample app stays trivial to reason about.
 */

/**
 * Convert a string to Title Case: each whitespace-separated word gets an
 * uppercase first letter and lowercase remainder. Collapses surrounding
 * whitespace but preserves single spaces between words.
 */
export function toTitleCase(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Format an integer amount of minor currency units (e.g. cents) as a localized
 * currency string. `cents` is the smallest unit; `currency` is an ISO 4217 code.
 */
export function formatCurrency(
  cents: number,
  currency: string = "USD",
): string {
  if (!Number.isFinite(cents)) {
    throw new RangeError(`cents must be a finite number, received: ${cents}`);
  }
  const amount = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Truncate a string to `maxLength` characters, appending an ellipsis when the
 * input is longer. Returns the input unchanged when it already fits.
 */
export function truncate(input: string, maxLength: number): string {
  if (maxLength < 0) {
    throw new RangeError(`maxLength must be >= 0, received: ${maxLength}`);
  }
  if (input.length <= maxLength) {
    return input;
  }
  if (maxLength === 0) {
    return "";
  }
  return `${input.slice(0, maxLength)}…`;
}
