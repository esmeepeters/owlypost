import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveEmailConfig } from "./config.ts";

const addresses = {
  DIGEST_EMAIL_FROM: "owly@example.com",
  DIGEST_EMAIL_TO: "esmee@example.com",
};

test("provider defaults to resend and requires the API key plus addresses", () => {
  assert.equal(resolveEmailConfig({}), null);
  assert.equal(resolveEmailConfig({ RESEND_API_KEY: "re_123" }), null);
  assert.equal(resolveEmailConfig({ ...addresses }), null);
  assert.deepEqual(resolveEmailConfig({ ...addresses, RESEND_API_KEY: "re_123" }), {
    provider: "resend",
    from: "owly@example.com",
    to: "esmee@example.com",
    apiKey: "re_123",
  });
});

test("smtp requires a host plus addresses", () => {
  assert.equal(resolveEmailConfig({ EMAIL_PROVIDER: "smtp", ...addresses }), null);
  assert.equal(
    resolveEmailConfig({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "mail.example.com" }),
    null,
  );
  const config = resolveEmailConfig({
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "mail.example.com",
    ...addresses,
  });
  assert.ok(config && config.provider === "smtp");
  assert.equal(config.host, "mail.example.com");
});

test("smtp defaults to port 587 with STARTTLS and no auth", () => {
  const config = resolveEmailConfig({
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "mail.example.com",
    ...addresses,
  });
  assert.ok(config && config.provider === "smtp");
  assert.equal(config.port, 587);
  assert.equal(config.secure, false);
  assert.equal(config.auth, undefined);
});

test("port 465 infers implicit TLS; SMTP_SECURE overrides either way", () => {
  const base = { EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", ...addresses };
  let config = resolveEmailConfig({ ...base, SMTP_PORT: "465" });
  assert.ok(config && config.provider === "smtp" && config.secure === true);
  config = resolveEmailConfig({ ...base, SMTP_PORT: "465", SMTP_SECURE: "false" });
  assert.ok(config && config.provider === "smtp" && config.secure === false);
  config = resolveEmailConfig({ ...base, SMTP_PORT: "2525", SMTP_SECURE: "true" });
  assert.ok(config && config.provider === "smtp" && config.secure === true);
});

test("auth is included only when SMTP_USER is set", () => {
  const base = { EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", ...addresses };
  let config = resolveEmailConfig({ ...base, SMTP_PASS: "orphaned" });
  assert.ok(config && config.provider === "smtp");
  assert.equal(config.auth, undefined);
  config = resolveEmailConfig({ ...base, SMTP_USER: "u", SMTP_PASS: "p" });
  assert.ok(config && config.provider === "smtp");
  assert.deepEqual(config.auth, { user: "u", pass: "p" });
});

test("an invalid port disables email instead of throwing", () => {
  const base = { EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", ...addresses };
  assert.equal(resolveEmailConfig({ ...base, SMTP_PORT: "banana" }), null);
  assert.equal(resolveEmailConfig({ ...base, SMTP_PORT: "0" }), null);
  assert.equal(resolveEmailConfig({ ...base, SMTP_PORT: "70000" }), null);
});

test("an unknown provider disables email instead of throwing", () => {
  assert.equal(
    resolveEmailConfig({
      EMAIL_PROVIDER: "pigeon",
      RESEND_API_KEY: "re_123",
      SMTP_HOST: "h",
      ...addresses,
    }),
    null,
  );
});
