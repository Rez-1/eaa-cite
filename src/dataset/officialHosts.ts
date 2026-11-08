/**
 * The hosts a source may be on: EUR-Lex, the Commission, national gazettes
 * and statute sites, and the authorities themselves. A load rule refuses any
 * other host, and verify-sources follows redirects only between these, so a
 * data change cannot point the checker (or the CI runner it runs on) at an
 * arbitrary or internal address. Adding a jurisdiction means adding its hosts
 * here.
 */
export const OFFICIAL_SOURCE_HOSTS: ReadonlySet<string> = new Set([
  "eur-lex.europa.eu",
  "single-market-economy.ec.europa.eu",
  "www.riksdagen.se",
  "www.gesetze-im-internet.de",
  "www.bgbl.de",
  "www.mlbf-barrierefrei.de",
  "www.boe.es",
]);

/** An https URL on one of the official hosts. */
export function isOfficialSourceUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && OFFICIAL_SOURCE_HOSTS.has(url.hostname) && url.port === "";
  } catch {
    return false;
  }
}
