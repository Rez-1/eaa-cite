import { describe, expect, it } from "vitest";
import { datesInText, figuresInValue, numbersInText } from "./figures.js";

describe("figures", () => {
  it("collects every number and ISO date in a value, and skips other text", () => {
    expect(figuresInValue({ date: "2025-06-28", tiers: [{ min: null, max: 10 }], summary: "up to 10" })).toEqual({
      numbers: [10],
      dates: ["2025-06-28"],
    });
  });

  it("reads digits with thousands separators, millions and number words", () => {
    const found = numbersInText("fewer than ten persons, EUR 10,000 to 2 million");
    expect([...found].sort((a, b) => a - b)).toEqual([2, 10, 10_000, 2_000_000]);
  });

  it("does not read a word that only contains a number word", () => {
    expect(numbersInText("often, tension").size).toBe(0);
  });

  it("reads English dates as ISO dates", () => {
    expect([...datesInText("until 27 June 2030, from 1 January 2026")]).toEqual(["2030-06-27", "2026-01-01"]);
    expect(datesInText("28 Juni 2025").size).toBe(0);
  });
});
