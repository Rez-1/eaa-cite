/**
 * The figures a claim states, and the figures its citations state, so a load
 * rule can check that every number and date in a value comes from its quote.
 *
 * The citation side reads the English text: the translation, or the quote when
 * the source is in English. One parser for English is enough, because every
 * non-English quote must carry a translation, and a reviewer compares the
 * translation with the quote.
 */

/** Every number and ISO date in a claim's value, however deeply nested. Text fields are skipped. */
export function figuresInValue(value: unknown): { numbers: number[]; dates: string[] } {
  const numbers: number[] = [];
  const dates: string[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === "number") numbers.push(v);
    else if (typeof v === "string" && ISO_DATE.test(v)) dates.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(value);
  return { numbers, dates };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * Numbers written in English text: "10,000", "EUR 2 million", "fifteen".
 * "2 million" yields both 2 and 2,000,000, so a value of either is found.
 */
export function numbersInText(text: string): Set<number> {
  const found = new Set<number>();
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)(?:\s+(million))?/gi)) {
    const n = Number(m[1]!.replaceAll(",", ""));
    found.add(n);
    if (m[2]) found.add(n * 1_000_000);
  }
  for (const m of text.toLowerCase().matchAll(/\b([a-z]+)\b/g)) {
    const n = WORDS[m[1]!];
    if (n !== undefined) found.add(n);
  }
  return found;
}

/** Dates written "28 June 2025" in English text, as ISO dates. */
export function datesInText(text: string): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/g)) {
    const month = MONTHS.indexOf(m[2]!.toLowerCase());
    if (month >= 0) found.add(`${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  }
  return found;
}
