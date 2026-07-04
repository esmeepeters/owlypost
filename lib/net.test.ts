import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicUrl, isBlockedAddress, SsrfError } from "./net.ts";

test("blocks private and reserved IPv4 ranges", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
  ]) {
    assert.equal(isBlockedAddress(ip), true, `${ip} should be blocked`);
  }
});

test("allows public IPv4 addresses", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1"]) {
    assert.equal(isBlockedAddress(ip), false, `${ip} should be allowed`);
  }
});

test("blocks private and reserved IPv6 ranges", () => {
  for (const ip of [
    "::1", // loopback
    "::", // unspecified
    "fe80::1", // link-local
    "fc00::1", // unique-local
    "fd12:3456::1", // unique-local
    "ff02::1", // multicast
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:10.0.0.1", // IPv4-mapped private
  ]) {
    assert.equal(isBlockedAddress(ip), true, `${ip} should be blocked`);
  }
});

test("allows public IPv6 addresses", () => {
  for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888"]) {
    assert.equal(isBlockedAddress(ip), false, `${ip} should be allowed`);
  }
});

test("garbage is treated as unsafe", () => {
  assert.equal(isBlockedAddress("not-an-ip"), true);
  assert.equal(isBlockedAddress(""), true);
});

test("assertPublicUrl rejects non-http(s) schemes", async () => {
  await assert.rejects(
    () => assertPublicUrl("file:///etc/passwd"),
    (error: unknown) => error instanceof SsrfError,
  );
  await assert.rejects(
    () => assertPublicUrl("gopher://example.com"),
    (error: unknown) => error instanceof SsrfError,
  );
});

test("assertPublicUrl rejects loopback IP literals", async () => {
  await assert.rejects(
    () => assertPublicUrl("http://127.0.0.1/admin"),
    (error: unknown) => error instanceof SsrfError,
  );
  await assert.rejects(
    () => assertPublicUrl("http://[::1]:5432/"),
    (error: unknown) => error instanceof SsrfError,
  );
});
