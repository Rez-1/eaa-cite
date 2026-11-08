/**
 * WCAG success criteria named by an axe rule's tags: `wcag111` -> `1.1.1`,
 * `wcag1410` -> `1.4.10`. Principles and guidelines are single digits, so the
 * rest of the tag is the criterion number.
 */
export function wcagRefsFromTags(tags: readonly string[]): string[] {
  const refs: string[] = [];
  for (const tag of tags) {
    const match = /^wcag(\d)(\d)(\d+)$/.exec(tag);
    if (match) refs.push(`${match[1]}.${match[2]}.${match[3]}`);
  }
  return refs;
}
