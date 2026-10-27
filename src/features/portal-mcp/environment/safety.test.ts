import { describe, expect, it } from "vitest";
import { isSensitiveEnvironmentKey, isSensitiveEnvironmentValue } from "./safety";

describe("environment value disclosure", () => {
  it.each(["API_KEY", "apiKey", "CLIENT_SECRET", "password", "PWD", "ACCESS_TOKEN", "ConnectionString", "DATABASE_URL", "AUTHORIZATION", "SESSION_COOKIE", "PRIVATE_CERTIFICATE", "AZURE_SAS", "SIGNING_KEY"])("withholds sensitive key %s", key => {
    expect(isSensitiveEnvironmentKey(key)).toBe(true);
  });
  it.each(["FEATURE_FLAG", "APP_TITLE", "SUPPORT_EMAIL", "PUBLIC_BASE_URL", "MAX_ROWS", "LOG_LEVEL"])("allows ordinary key %s", key => {
    expect(isSensitiveEnvironmentKey(key)).toBe(false);
  });
  const keyLabel = ["PRIVATE", "KEY"].join(" ");
  it.each([
    "Authorization: Bearer synthetic-sensitive-value",
    "AccountKey=synthetic-value;Endpoint=https://example.test",
    "https://user:synthetic-pass@example.test",
    "https://example.test/file?sig=synthetic-signature",
    ' {"api_key":"synthetic-value"}',
    ["ghp", "x".repeat(25)].join("_"),
    ["github", "pat", "x".repeat(25)].join("_"),
    `-----BEGIN ${keyLabel}-----\nabcdef\n-----END ${keyLabel}-----`,
    "Bearer synthetic-bearer",
    "Basic c3ludGhldGljOnBhc3N3b3Jk",
    "Endpoint=sb://example.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=synthetic-value",
    '{"credential":"synthetic-value"}',
    '{"pwd":"synthetic-value"}',
    '{"credentials":{"value":"synthetic-value"}}',
    "https://example.test?access%5Ftoken=synthetic-value",
    "https://example.test?code=synthetic-code",
    "https://example.test?client_secret=synthetic-secret",
    "sk-" + "synthetic".repeat(8),
    "eyJhbGciOiJub25lIn0.eyJzdWIiOiJleGFtcGxlIn0.synthetic",
  ])("withholds recognizable credential content %#", value => {
    expect(isSensitiveEnvironmentValue(value)).toBe(true);
  });
  it.each(["", "on", "false", "100", "Hello world", "https://example.test/path?view=list", "help@example.test"])("allows ordinary content %s", value => {
    expect(isSensitiveEnvironmentValue(value)).toBe(false);
  });
});
