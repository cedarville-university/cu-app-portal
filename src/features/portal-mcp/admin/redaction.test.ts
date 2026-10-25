import { expect, it } from "vitest";
import { redactDiagnosticText } from "./redaction";
it("redacts credentials while keeping multiline stack traces and Unicode", () => {
  const input = 'Authorization: Basic abc123\nBearer abc123\n{"client_secret":"hidden value", "DATABASE_URL":"postgres://user:pass@host/db"}\nhttps://user:pass@example.test/?sig=abcd&token=efgh\n-----BEGIN PRIVATE KEY-----\nabcdef\n-----END PRIVATE KEY-----\nError: failed 🐝\n at run (app.ts:10)';
  const result = redactDiagnosticText(input);
  for (const secret of [
    "abc123", "hidden value", "user:pass", "abcd", "efgh", "abcdef"
  ])
    expect(result).not.toContain(secret);
  expect(result).toContain("Error: failed 🐝\n at run (app.ts:10)");
});
it("redacts long unbroken log lines without quadratic scanning", () => {
  const started = performance.now();
  expect(redactDiagnosticText("a".repeat(64000))).toHaveLength(64000);
  expect(performance.now() - started).toBeLessThan(1000);
});
it("redacts canonical Azure Storage and SQL connection-string credentials", () => {
  const value = "DefaultEndpointsProtocol=https;AccountName=example;AccountKey=SYNTHETIC_STORAGE_KEY;EndpointSuffix=core.windows.net\nServer=example;Uid=user;Pwd=SYNTHETIC_SQL_PASSWORD with spaces;Database=db\nSharedAccessSignature=sv=1&sig=SYNTHETIC_SAS;";
  const result = redactDiagnosticText(value);
  for (const secret of [
    "SYNTHETIC_STORAGE_KEY", "SYNTHETIC_SQL_PASSWORD", "with spaces", "SYNTHETIC_SAS"
  ])
    expect(result).not.toContain(secret);
});
