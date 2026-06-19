import { describe, expect, it } from "vitest";
import { seedTemplates } from "./seed";

describe("seedTemplates", () => {
  it("returns active template seeds in chooser order", () => {
    const rows = seedTemplates();

    expect(rows.map((row) => row.slug)).toEqual([
      "department-form-approval",
      "simple-data-tracker",
      "public-information-page",
      "web-app",
      "python-fastapi",
    ]);
    expect(rows[0]?.status).toBe("ACTIVE");
  });
});
