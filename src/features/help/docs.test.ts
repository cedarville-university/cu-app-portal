import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getHelpDocument, getHelpDocuments } from "./docs";

describe("user help documents", () => {
  it("loads the quick start and its maintenance metadata", async () => {
    const document = await getHelpDocument("quick-start");
    expect(document.title).toBe("Quick Start");
    expect(document.body).toContain("Publish the starter now");
    expect(document.body).toContain(
      "**Publish the starter now** starts Azure publishing immediately",
    );
    expect(document.body).toContain("Customize it with Codex first");
    expect(document.body).toContain("Continue Setup");
    expect(document.body).not.toContain("Create and Publish");
    expect(document.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps troubleshooting, FAQ, and secret-safety guidance in the user set", async () => {
    const documents = await getHelpDocuments();
    const combined = documents.map((document) => document.body).join("\n");
    expect(combined).toContain("Repair Publishing Setup");
    expect(combined).toContain("Frequently Asked Questions");
    expect(combined).toContain("Never send secret values");
  });

  it("ships both downloadable PDF artifacts", async () => {
    for (const filename of [
      "cedarville-app-portal-quick-start.pdf",
      "cedarville-app-portal-user-guide.pdf",
    ]) {
      const file = await readFile(join(process.cwd(), "public", "docs", filename));
      expect(file.subarray(0, 5).toString()).toBe("%PDF-");
      expect(file.byteLength).toBeGreaterThan(3_000);
    }
  });
});
