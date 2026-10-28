import { describe, expect, it } from "vitest";
import { needsLoginUpdateNotice } from "./login-update";

const legacy = {
  sourceOfTruth: "PORTAL_MANAGED_REPO", templateVersion: "1.0.0",
  submittedConfig: { templateSlug: "web-app", entraLogin: true },
};

describe("login update notice eligibility", () => {
  it("includes older Next.js sign-in apps and excludes updated starters", () => {
    expect(needsLoginUpdateNotice(legacy)).toBe(true);
    for (const templateVersion of ["1.1.0", "1.2.0", "2.0.0"]) {
      expect(needsLoginUpdateNotice({ ...legacy, templateVersion })).toBe(false);
    }
    expect(needsLoginUpdateNotice({ ...legacy, templateVersion: "unknown" })).toBe(true);
  });
  it("excludes public apps, FastAPI, and apps without recorded sign-in", () => {
    for (const submittedConfig of [null, {}, { entraLogin: false }, { templateSlug: "python-fastapi", entraLogin: true }]) {
      expect(needsLoginUpdateNotice({ ...legacy, submittedConfig })).toBe(false);
    }
  });
  it("includes legacy sign-in defaults from before the audience choice existed", () => {
    expect(needsLoginUpdateNotice({ ...legacy, submittedConfig: { templateSlug: "web-app" } })).toBe(true);
    expect(needsLoginUpdateNotice({ ...legacy, submittedConfig: {}, template: { slug: "web-app" } })).toBe(true);
    expect(needsLoginUpdateNotice({ ...legacy, submittedConfig: { templateSlug: "public-information-page" } })).toBe(false);
  });
  it("includes imported Next.js sign-in apps without treating their template version as a code upgrade", () => {
    const imported = { ...legacy, sourceOfTruth: "IMPORTED_REPOSITORY", templateVersion: "1.1.0", submittedConfig: {
      importFeatures: { entraLogin: true }, importRuntime: { framework: "nextjs" },
    } };
    expect(needsLoginUpdateNotice(imported)).toBe(true);
    expect(needsLoginUpdateNotice({ ...imported, submittedConfig: { importFeatures: { entraLogin: true }, importRuntime: { framework: "fastapi" } } })).toBe(false);
  });
});
