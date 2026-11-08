import { describe, expect, it } from "vitest";
import { isPrivateAddress, isPrivateHost, type Resolve } from "./privateHost.js";

/** A resolver that answers from a table, so no test depends on real DNS. */
const answers = (table: Record<string, string[]>): Resolve => async (host) => {
  const found = table[host];
  if (!found) throw new Error(`ENOTFOUND ${host}`);
  return found;
};
const nowhere: Resolve = async (host) => {
  throw new Error(`no lookup expected for ${host}`);
};

describe("isPrivateAddress", () => {
  it("knows the private IPv4 ranges, on both sides of each edge", () => {
    for (const ip of ["0.0.0.0", "10.1.2.3", "100.64.0.1", "100.127.255.255", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.168.1.1", "198.18.0.1", "198.19.255.255"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "100.128.0.1", "172.32.0.1", "192.0.1.1", "192.169.0.1", "198.20.0.1", "203.0.113.7"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("knows the private IPv6 ranges, including IPv4 written inside IPv6", () => {
    for (const ip of [
      "::", "::1", "fd12::1", "fe80::1", "fec0::1",
      "::ffff:10.0.0.1", "::ffff:a00:1", "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:1", "::7f00:1",
      "::ffff:0:127.0.0.1", "64:ff9b::a00:1", "64:ff9b:1::1", "2002:7f00:1::", "2002:a9fe:a9fe::",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["2001:4860::8888", "::ffff:8.8.8.8", "::ffff:808:808", "64:ff9b::808:808", "2002:808:808::"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("isPrivateHost", () => {
  it("checks hostnames exactly as URL.hostname writes them, without a lookup", async () => {
    for (const url of ["http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[::]/", "http://0.0.0.0/", "http://0x7f.1/", "http://2130706433/", "http://[::ffff:10.0.0.1]/"]) {
      expect(await isPrivateHost(new URL(url).hostname, nowhere), url).toBe(true);
    }
    expect(await isPrivateHost(new URL("http://203.0.113.7/").hostname, nowhere)).toBe(false);
  });

  it("treats localhost and any *.localhost name as private by name, whatever DNS says", async () => {
    const lying = answers({ "shop.localhost": ["203.0.113.7"], localhost: ["203.0.113.7"] });
    expect(await isPrivateHost("localhost", lying)).toBe(true);
    expect(await isPrivateHost("shop.localhost", lying)).toBe(true);
    expect(await isPrivateHost("localhost.", lying)).toBe(true);
  });

  it("is private when any resolved address is private", async () => {
    const dns = answers({ "mixed.test": ["203.0.113.7", "10.0.0.5"], "public.test": ["203.0.113.7", "2001:db8::1"], "metadata.test": ["169.254.169.254"] });
    expect(await isPrivateHost("mixed.test", dns)).toBe(true);
    expect(await isPrivateHost("metadata.test", dns)).toBe(true);
    expect(await isPrivateHost("public.test", dns)).toBe(false);
  });

  it("counts a name that does not resolve as public, because the fetch then fails the same way", async () => {
    expect(await isPrivateHost("nowhere.test", answers({}))).toBe(false);
  });
});
