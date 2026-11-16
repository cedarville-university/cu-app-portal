import { describe, expect, it } from "vitest";
import { buildImportLoginGuidance } from "./import-login-guidance";
const app = { appName: "Imported App", repositoryUrl: "https://github.com/cu/app", submittedConfig: { entraLogin: true } };
describe("shared import login requirements", () => {
  it.each(["nextjs", "express"])("supplies self-contained requirements and a recovery prompt for %s", framework => {
    const value = buildImportLoginGuidance({ ...app, submittedConfig: { entraLogin: true, importRuntime: { framework } } });
    expect(value.required).toBe(true); expect(value.requirements.length).toBeGreaterThan(0);
    expect(value.updatePrompt).toContain(app.repositoryUrl);
    expect(value.reviewInstructions).toContain("review_imported_app_login");
  });
  it("preserves a public app's audience", () => {
    expect(buildImportLoginGuidance({ ...app, submittedConfig: { entraLogin: false } })).toMatchObject({ required: false, updatePrompt: null, requirements: [] });
  });
  it("supplies a usable prompt before the imported runtime or app-local skill exists", () => {
    expect(buildImportLoginGuidance(app).updatePrompt).toContain("Inspect the actual framework");
  });
});
