import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Whether a hostname is, or resolves to, a private network address. Used by
 * the scanner's redirect rule (WCA-60). A name that does not resolve is not
 * private; the navigation to it fails on its own.
 *
 * Hostnames arrive as `URL.hostname` gives them. The URL parser already turns
 * odd IPv4 spellings (`0x7f.1`, `2130706433`, `127.1`) into dotted form, but it
 * writes an IPv4 address inside IPv6 as hex (`[::ffff:7f00:1]`), so IPv6 is
 * expanded to its eight groups before anything is compared.
 */
export type Resolve = (hostname: string) => Promise<string[]>;

const resolveWithDns: Resolve = async (hostname) => (await lookup(hostname, { all: true })).map((a) => a.address);

/**
 * A name counts as private if any address it resolves to is private: one
 * private answer is enough for a server to be reached there.
 *
 * A name that does not resolve counts as public. That is safe because the
 * scanner's own fetch (fetchDocument) resolves the name again and fails the
 * same way, so nothing is loaded; the gap between the two lookups is DNS
 * rebinding, tracked separately (SECURITY.md).
 */
export async function isPrivateHost(hostname: string, resolve: Resolve = resolveWithDns): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (isIP(host)) return isPrivateAddress(host);
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    return false;
  }
  return addresses.some(isPrivateAddress);
}

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (isIP(ip) === 4) return isPrivateIPv4(ip.split(".").map(Number));
  if (isIP(ip) === 6) return isPrivateIPv6(expandIPv6(ip));
  return false;
}

/** Ranges that reach this machine or a private network, as [first octets, prefix length]. */
const PRIVATE_IPV4: readonly [number[], number][] = [
  [[0], 8], // "this network": 0.0.0.0 reaches localhost
  [[10], 8],
  [[100, 64], 10], // carrier-grade NAT
  [[127], 8], // loopback
  [[169, 254], 16], // link-local, including cloud metadata at 169.254.169.254
  [[172, 16], 12],
  [[192, 0, 0], 24], // IETF protocol assignments
  [[192, 168], 16],
  [[198, 18], 15], // benchmarking
];

function isPrivateIPv4(octets: readonly number[]): boolean {
  const value = octets.reduce((n, o) => n * 256 + o, 0);
  return PRIVATE_IPV4.some(([start, bits]) => {
    const base = [...start, 0, 0, 0, 0].slice(0, 4).reduce((n, o) => n * 256 + o, 0);
    const size = 2 ** (32 - bits);
    return value >= base && value < base + size;
  });
}

function isPrivateIPv6(words: readonly number[]): boolean {
  const [w0 = 0, w1 = 0, w2 = 0, , w4 = 0, w5 = 0, w6 = 0, w7 = 0] = words;
  const zero = (from: number, to: number): boolean => words.slice(from, to).every((w) => w === 0);
  const v4 = (hi: number, lo: number): number[] => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];

  if (zero(0, 8)) return true; // :: (unspecified) reaches localhost
  if (zero(0, 7) && w7 === 1) return true; // ::1
  // IPv4 carried inside IPv6: the IPv4 address decides.
  if (zero(0, 5) && (w5 === 0xffff || w5 === 0)) return isPrivateIPv4(v4(w6, w7)); // ::ffff:a.b.c.d, ::a.b.c.d
  if (zero(0, 4) && w4 === 0xffff && w5 === 0) return isPrivateIPv4(v4(w6, w7)); // ::ffff:0:a.b.c.d (SIIT)
  if (w0 === 0x64 && w1 === 0xff9b && zero(2, 6)) return isPrivateIPv4(v4(w6, w7)); // 64:ff9b::/96 NAT64
  if (w0 === 0x64 && w1 === 0xff9b && w2 === 1) return true; // 64:ff9b:1::/48 local-use NAT64
  if (w0 === 0x2002) return isPrivateIPv4(v4(w1, w2)); // 6to4: 2002:aabb:ccdd::
  return (
    (w0 & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (w0 & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (w0 & 0xffc0) === 0xfec0 // fec0::/10 site-local (deprecated, still routed by some networks)
  );
}

/** "::ffff:7f00:1" -> [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]. Accepts a dotted IPv4 tail. */
function expandIPv6(ip: string): number[] {
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  let text = ip;
  if (dotted) {
    const [a, b, c, d] = dotted[1]!.split(".").map(Number) as [number, number, number, number];
    text = ip.slice(0, -dotted[1]!.length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split("::") as [string, string | undefined];
  const parse = (part: string): number[] => (part ? part.split(":").map((g) => parseInt(g, 16)) : []);
  const front = parse(head);
  const back = tail === undefined ? [] : parse(tail);
  const fill = tail === undefined ? [] : new Array<number>(8 - front.length - back.length).fill(0);
  return [...front, ...fill, ...back];
}
