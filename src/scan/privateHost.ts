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
export async function isPrivateHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (isIP(host)) return isPrivateAddress(host);
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.some((a) => isPrivateAddress(a.address));
  } catch {
    return false;
  }
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
  [[192, 168], 16],
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
  const [w0 = 0, w1 = 0, , , , w5 = 0, w6 = 0, w7 = 0] = words;
  const leadingZeros = words.slice(0, 5).every((w) => w === 0);
  const embeddedV4 = [w6 >> 8, w6 & 0xff, w7 >> 8, w7 & 0xff];

  if (words.every((w) => w === 0)) return true; // :: (unspecified) reaches localhost
  if (leadingZeros && w5 === 0 && w6 === 0 && w7 === 1) return true; // ::1
  if (leadingZeros && (w5 === 0xffff || w5 === 0)) return isPrivateIPv4(embeddedV4); // ::ffff:a.b.c.d, ::a.b.c.d
  if (w0 === 0x64 && w1 === 0xff9b && words.slice(2, 6).every((w) => w === 0)) return isPrivateIPv4(embeddedV4); // NAT64
  return (w0 & 0xfe00) === 0xfc00 /* fc00::/7 unique local */ || (w0 & 0xffc0) === 0xfe80; /* fe80::/10 link-local */
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
