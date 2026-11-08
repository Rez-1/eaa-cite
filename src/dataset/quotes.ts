/**
 * Checks that a cited quote is in a source's text. Pure, so the matching rules
 * are tested without the network; scripts/verify-sources.ts supplies the text.
 */

/** Named entities that appear on the statute sites this dataset reads. */
const NAMED: Readonly<Record<string, string>> = {
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  aring: "å", Aring: "Å", oslash: "ø", Oslash: "Ø", aelig: "æ", AElig: "Æ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É",
  Iacute: "Í", Oacute: "Ó", Uacute: "Ú", ntilde: "ñ", Ntilde: "Ñ", ccedil: "ç", Ccedil: "Ç",
  agrave: "à", egrave: "è", ograve: "ò", ecirc: "ê", ordf: "ª", ordm: "º", sect: "§",
  euro: "€", laquo: "«", raquo: "»", ldquo: "\u201c", rdquo: "\u201d", bdquo: "\u201e",
  lsquo: "\u2018", rsquo: "\u2019", ndash: "\u2013", mdash: "\u2014", hellip: "…", shy: "\u00ad",
};

/**
 * Text as a person reads it: tags and scripts dropped, entities decoded,
 * typographic quotes and dashes folded to ASCII, whitespace collapsed. Statute
 * sites wrap words in markup mid-sentence, so matching raw HTML would fail on
 * text that is plainly there.
 */
export function readableText(html: string): string {
  return fold(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&([a-zA-Z]+);/g, (whole, name: string) => NAMED[name] ?? whole)
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
      // Last, so "&amp;lt;" becomes the text "&lt;", not "<".
      .replace(/&amp;/g, "&"),
  );
}

function fold(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/­/g, "")
    .replace(/\s+/g, " ")
    // EUR-Lex prints a space before some punctuation; drop it on both sides.
    .replace(/ ([,.;:)])/g, "$1")
    .trim();
}

/** The pieces of a quote either side of "…" or "[…]", each folded like the source. */
export function quoteSegments(quote: string): string[] {
  return quote
    .split(/\s*(?:\[…\]|\[\.\.\.\]|…)\s*/)
    .map((piece) => fold(piece))
    .filter((piece) => piece.length > 0);
}

export type QuoteCheck = { found: true } | { found: false; missing: string };

/** Every segment must appear, in order, after the previous one. */
export function findQuote(text: string, quote: string): QuoteCheck {
  let from = 0;
  for (const segment of quoteSegments(quote)) {
    const at = text.indexOf(segment, from);
    if (at === -1) return { found: false, missing: segment };
    from = at + segment.length;
  }
  return { found: true };
}

export function wordCount(quote: string): number {
  return quoteSegments(quote).join(" ").split(" ").filter(Boolean).length;
}
