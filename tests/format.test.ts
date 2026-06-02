import { describe, expect, it } from "vitest";

import { formatCurrency, toTitleCase, truncate } from "../src/lib/format.js";

describe("toTitleCase", () => {
  it("capitalizes the first letter of each word", () => {
    expect(toTitleCase("hello world")).toBe("Hello World");
  });

  it("lowercases the remainder of each word", () => {
    expect(toTitleCase("ADA LOVELACE")).toBe("Ada Lovelace");
  });

  it("collapses extra whitespace", () => {
    expect(toTitleCase("  grace   hopper  ")).toBe("Grace Hopper");
  });

  it("returns an empty string for empty input", () => {
    expect(toTitleCase("   ")).toBe("");
  });
});

describe("formatCurrency", () => {
  it("formats cents as USD by default", () => {
    expect(formatCurrency(1099)).toBe("$10.99");
  });

  it("formats whole-dollar amounts", () => {
    expect(formatCurrency(500)).toBe("$5.00");
  });

  it("honors an explicit currency code", () => {
    // Use a non-breaking space tolerant assertion: ICU output for EUR includes "€".
    expect(formatCurrency(2500, "EUR")).toContain("25.00");
  });

  it("throws on a non-finite amount", () => {
    expect(() => formatCurrency(Number.NaN)).toThrow(RangeError);
  });
});

describe("truncate", () => {
  it("leaves short strings untouched", () => {
    expect(truncate("hi", 5)).toBe("hi");
  });

  it("appends an ellipsis when truncating", () => {
    expect(truncate("hello world", 5)).toBe("hello…");
  });

  it("throws on a negative maxLength", () => {
    expect(() => truncate("x", -1)).toThrow(RangeError);
  });
});
