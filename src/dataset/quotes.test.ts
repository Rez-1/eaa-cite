import { describe, expect, it } from "vitest";
import { findQuote, quoteSegments, readableText, wordCount } from "./quotes.js";

describe("readableText", () => {
  it("drops markup that splits a sentence and decodes entities", () => {
    const html = `<p>Die&nbsp;<span class="x">Geldbuße</span> kann bis zu <b>hunderttausend</b> Euro betragen.</p><script>var a="Geldbuße";</script>`;
    expect(readableText(html)).toBe("Die Geldbuße kann bis zu hunderttausend Euro betragen.");
  });

  it("decodes the named entities statute sites use for accented letters", () => {
    expect(readableText("gemeinsame &Uuml;berwachungsstelle aller 16 Bundesl&auml;nder &sect; 37")).toBe(
      "gemeinsame Überwachungsstelle aller 16 Bundesländer § 37",
    );
    expect(readableText("&ldquo;microempresa&rdquo; &ndash; espa&ntilde;ol &bogus;")).toBe(`"microempresa" - español &bogus;`);
  });

  it("folds typographic quotes and dashes", () => {
    expect(readableText("„Kleinstunternehmen“ – ‘microenterprise’")).toBe(`"Kleinstunternehmen" - 'microenterprise'`);
  });

  it("removes the space EUR-Lex prints before a comma", () => {
    expect(readableText("the European Union , shall be presumed")).toBe("the European Union, shall be presumed");
  });
});

describe("findQuote", () => {
  const text = readableText("<p>Service contracts agreed before 28 June 2025 may continue without alteration until they expire, but no longer than five years from that date.</p>");

  it("finds a verbatim quote", () => {
    expect(findQuote(text, "may continue without alteration until they expire")).toEqual({ found: true });
  });

  it("finds each piece of an elided quote, in order", () => {
    expect(findQuote(text, "Service contracts agreed before 28 June 2025 may continue … but no longer than five years from that date.")).toEqual({ found: true });
    expect(findQuote(text, "Service contracts […] five years")).toEqual({ found: true });
  });

  it("rejects pieces that are present but out of order", () => {
    expect(findQuote(text, "five years … Service contracts")).toEqual({ found: false, missing: "Service contracts" });
  });

  it("reports the first missing piece", () => {
    expect(findQuote(text, "may continue … but no longer than ten years")).toEqual({ found: false, missing: "but no longer than ten years" });
  });
});

describe("quoteSegments and wordCount", () => {
  it("splits on both ellipsis styles", () => {
    expect(quoteSegments("a b … c […] d")).toEqual(["a b", "c", "d"]);
  });

  it("counts the words actually quoted", () => {
    expect(wordCount("one two … three")).toBe(3);
  });
});
