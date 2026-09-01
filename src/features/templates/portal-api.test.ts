import { describe, expect, it } from "vitest";
import { listPortalTemplateSummaries } from "./portal-api";

describe("listPortalTemplateSummaries", () => {
  it("returns only safe caller-selectable details for active templates", () => {
    const summaries = listPortalTemplateSummaries();

    expect(summaries.find((item) => item.slug === "web-app")).toMatchObject({
      hostingTarget: "Azure App Service",
      database: { mode: "optional", options: ["postgresql", "none"] },
      audience: { cedarville: true, public: true },
    });
    expect(summaries).not.toHaveLength(0);
    expect(JSON.stringify(summaries)).not.toContain("sourceTemplateSlug");
    expect(JSON.stringify(summaries)).not.toContain("startupCommand");
    expect(JSON.stringify(summaries)).not.toContain("workflowFileName");
  });
});
