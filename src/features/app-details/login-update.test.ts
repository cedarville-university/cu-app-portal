import { describe, expect, it } from "vitest";
import { getLoginUpdateFramework, needsLoginUpdateNotice } from "./login-update";

const legacy = {
  createdAt: new Date("2026-10-27T12:00:00Z"),
  sourceOfTruth: "PORTAL_MANAGED_REPO", templateVersion: "1.0.0",
  submittedConfig: { templateSlug: "web-app", entraLogin: true },
};

describe("login update notice eligibility", () => {
  it.each([
    { label: "generated", ...legacy },
    ...["nextjs", "express"].map((framework) => ({
      ...legacy,
      label: `imported ${framework}`,
      sourceOfTruth: "IMPORTED_REPOSITORY",
      submittedConfig: {
        entraLogin: true,
        importRuntime: { framework },
      },
    })),
  ])("only includes $label apps created before the login update", (app) => {
    expect(needsLoginUpdateNotice({
      ...app, createdAt: new Date("2026-10-28T14:33:19.999Z"),
    })).toBe(true);
    for (const createdAt of ["2026-10-28T14:33:20Z", "2026-10-28T14:33:20.001Z", "2026-11-02T12:00:00Z"]) {
      expect(needsLoginUpdateNotice({ ...app, createdAt: new Date(createdAt) })).toBe(false);
    }
  });

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
  it("includes imported Express sign-in apps and selects Express guidance", () => {
    const app = {
      ...legacy,
      sourceOfTruth: "IMPORTED_REPOSITORY",
      submittedConfig: {
        entraLogin: true,
        importRuntime: { framework: "express" },
      },
    };
    expect(needsLoginUpdateNotice(app)).toBe(true);
    expect(getLoginUpdateFramework(app)).toBe("express");
    expect(getLoginUpdateFramework(legacy)).toBe("nextjs");
    expect(needsLoginUpdateNotice({ ...app, submittedConfig: {
      ...app.submittedConfig, entraLogin: false,
    } })).toBe(false);
    expect(getLoginUpdateFramework({ ...app, submittedConfig: {
      entraLogin: true, importRuntime: { framework: "http-server" },
    } })).toBeNull();
  });
});
