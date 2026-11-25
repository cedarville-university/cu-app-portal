import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://portal:portal@localhost:5432/portal?schema=public";
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

const fixtureIds = {
  unpublished: "e2e-onboarding-unpublished",
  published: "e2e-onboarding-published",
  pendingImport: "e2e-onboarding-pending-import",
};
const createdAppNamePrefix = "E2E Created Starter";
const createdAppName = `${createdAppNamePrefix} Handoff`;
const createdRequestIds: string[] = [];

test("lists the advanced MCP template and shows the published app’s Plugin Creator handoff", async ({ page }) => {
  await page.goto("/create");
  await expect(page.getByText("MCP Server (Advanced)", { exact: true })).toBeVisible();
  const user=await prisma.user.upsert({where:{entraOid:"e2e-bypass-user"},update:{},create:{entraOid:"e2e-bypass-user",email:"e2e-bypass@cedarville.edu",displayName:"E2E Bypass User"}});
  const template=await prisma.template.upsert({where:{slug:"mcp-server"},update:{},create:{slug:"mcp-server",name:"MCP Server (Advanced)",description:"MCP fixture",version:"1.0.0",status:"DISABLED",inputSchema:{},hostingOptions:[]}});
  const id="e2e-mcp-connection";
  await prisma.appRequest.deleteMany({where:{id}});
  try {
    await prisma.appRequest.create({data:{id,userId:user.id,templateId:template.id,templateVersion:"1.0.0",appName:"MCP connection fixture",submittedConfig:{templateSlug:"mcp-server",entraLogin:true,databaseProvider:"none"},generationStatus:"SUCCEEDED",repositoryStatus:"READY",publishStatus:"SUCCEEDED",sourceOfTruth:"PORTAL_MANAGED_REPO",supportReference:"E2E-MCP",mcpConfiguration:{create:{endpointUrl:"https://fixture.azurewebsites.net/api/mcp",tenantId:"fixture-tenant",setupStatus:"READY"}}}});
    await page.goto(`/download/${id}`);
    await expect(page.getByRole("heading",{name:"Connect your plugin"})).toBeVisible();
    await expect(page.getByRole("link",{name:"https://fixture.azurewebsites.net/api/mcp"})).toBeVisible();
    await expect(page.getByText(/Sites is not required/)).toBeVisible();
  } finally { await prisma.appRequest.deleteMany({where:{id}}); }
});

function e2eAppRequestWhere() {
  return {
    OR: [
      { id: { in: [...Object.values(fixtureIds), ...createdRequestIds] } },
      { appName: { startsWith: createdAppNamePrefix } },
    ],
  };
}

test.describe("novice onboarding", () => {
  test.beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { entraOid: "e2e-bypass-user" },
      update: {
        email: "e2e-bypass@cedarville.edu",
        displayName: "E2E Bypass User",
      },
      create: {
        entraOid: "e2e-bypass-user",
        email: "e2e-bypass@cedarville.edu",
        displayName: "E2E Bypass User",
      },
    });
    const template = await prisma.template.upsert({
      where: { slug: "e2e-onboarding-template" },
      update: {},
      create: {
        slug: "e2e-onboarding-template",
        name: "E2E Onboarding Template",
        description: "Deterministic browser fixture",
        version: "1.0.0",
        status: "ACTIVE",
        inputSchema: {},
        hostingOptions: ["Azure App Service"],
      },
    });

    await prisma.appRequest.deleteMany({
      where: e2eAppRequestWhere(),
    });
    await prisma.appRequest.createMany({
      data: [
        {
          id: fixtureIds.unpublished,
          userId: user.id,
          templateId: template.id,
          templateVersion: template.version,
          appName: "E2E Starter Awaiting Publish",
          submittedConfig: { templateSlug: template.slug },
          generationStatus: "SUCCEEDED",
          supportReference: "E2E-UNPUBLISHED",
          deploymentTarget: "Azure App Service",
          sourceOfTruth: "PORTAL_MANAGED_REPO",
          repositoryProvider: "GITHUB",
          repositoryOwner: "cedarville-e2e",
          repositoryName: "starter-awaiting-publish",
          repositoryUrl:
            "https://github.com/cedarville-e2e/starter-awaiting-publish",
          repositoryDefaultBranch: "main",
          repositoryVisibility: "private",
          repositoryStatus: "READY",
          repositoryAccessStatus: "NOT_REQUESTED",
          publishingSetupStatus: "NOT_CHECKED",
          publishStatus: "NOT_STARTED",
        },
        {
          id: fixtureIds.pendingImport,
          userId: user.id,
          templateId: template.id,
          templateVersion: template.version,
          appName: "E2E Existing App Import",
          submittedConfig: { templateSlug: "imported-web-app" },
          generationStatus: "SUCCEEDED",
          supportReference: "E2E-PENDING-IMPORT",
          deploymentTarget: "Azure App Service",
          sourceOfTruth: "IMPORTED_REPOSITORY",
          repositoryProvider: "GITHUB",
          repositoryOwner: "cedarville-e2e",
          repositoryName: "existing-app-import",
          repositoryVisibility: "private",
          repositoryStatus: "PENDING",
          repositoryAccessStatus: "NOT_REQUESTED",
          publishingSetupStatus: "NOT_CHECKED",
          publishStatus: "NOT_STARTED",
        },
        {
          id: fixtureIds.published,
          userId: user.id,
          templateId: template.id,
          templateVersion: template.version,
          appName: "E2E Published Starter",
          submittedConfig: { templateSlug: template.slug },
          generationStatus: "SUCCEEDED",
          supportReference: "E2E-PUBLISHED",
          deploymentTarget: "Azure App Service",
          sourceOfTruth: "PORTAL_MANAGED_REPO",
          repositoryProvider: "GITHUB",
          repositoryOwner: "cedarville-e2e",
          repositoryName: "published-starter",
          repositoryUrl:
            "https://github.com/cedarville-e2e/published-starter",
          repositoryDefaultBranch: "main",
          repositoryVisibility: "private",
          repositoryStatus: "READY",
          repositoryAccessStatus: "GRANTED",
          publishingSetupStatus: "READY",
          publishStatus: "SUCCEEDED",
          primaryPublishUrl:
            "https://e2e-published-starter.azurewebsites.net",
          azureWebAppName: "e2e-published-starter",
          publishedAt: new Date(),
          lastPublishedAt: new Date(),
        },
      ],
    });
    await prisma.repositoryImport.create({
      data: {
        appRequestId: fixtureIds.pendingImport,
        sourceRepositoryUrl: "https://github.com/example/existing-app",
        sourceRepositoryOwner: "example",
        sourceRepositoryName: "existing-app",
        sourceRepositoryDefaultBranch: "main",
        targetRepositoryOwner: "cedarville-e2e",
        targetRepositoryName: "existing-app-import",
        importStatus: "PENDING",
        compatibilityStatus: "NOT_SCANNED",
        compatibilityFindings: [],
        preparationStatus: "NOT_STARTED",
      },
    });
  });

  test.afterAll(async () => {
    await prisma.appRequest.deleteMany({
      where: e2eAppRequestWhere(),
    });
    await prisma.template.deleteMany({
      where: {
        slug: "e2e-onboarding-template",
        appRequests: { none: {} },
      },
    });
    await prisma.$disconnect();
  });

  test("post-sign-in GitHub setup can be skipped or saved and reuses a saved username", async ({ page }) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { entraOid: "e2e-bypass-user" } });
    try {
      await prisma.user.update({ where: { id: user.id }, data: { githubUsername: null } });
      await page.goto("/onboarding/github?returnTo=%2Fonboarding");
      await expect(page.getByRole("heading", { name: "What's your GitHub username?" })).toBeVisible();
      await expect(page.getByRole("link", { name: /open github/i })).toHaveAttribute("href", "https://github.com");
      await expect(page.getByRole("link", { name: /open github/i })).toHaveAttribute("target", "_blank");
      await page.screenshot({ path: test.info().outputPath("github-setup-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: test.info().outputPath("github-setup-mobile.png"), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByRole("link", { name: "Skip for now" }).click();
      await expect(page).toHaveURL(/\/onboarding$/);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).githubUsername).toBeNull();

      await page.goto("/onboarding/github?returnTo=%2Fonboarding");
      await page.getByRole("textbox", { name: "GitHub username", exact: true }).fill("not@valid");
      await page.getByRole("button", { name: "Save and continue" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("Enter a valid GitHub username.");
      await expect(page.getByRole("textbox", { name: "GitHub username", exact: true })).toHaveValue("not@valid");
      await expect(page.getByRole("link", { name: "Skip for now" })).toBeVisible();

      await page.getByRole("textbox", { name: "GitHub username", exact: true }).fill("E2E-GitHub-User");
      await page.getByRole("button", { name: "Save and continue" }).click();
      await expect(page).toHaveURL(/\/onboarding$/);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).githubUsername).toBe("e2e-github-user");
      await page.goto("/onboarding/github?returnTo=%2Fapps");
      await expect(page).toHaveURL(/\/apps$/);
      await page.goto("/settings");
      await expect(page.getByLabel("GitHub username")).toHaveValue("e2e-github-user");
    } finally {
      await prisma.user.update({ where: { id: user.id }, data: { githubUsername: user.githubUsername } });
    }
  });

  test("routes new and existing apps to the intended beginner forms", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("link", { name: "Launch Your App", exact: true })
      .click();
    await page.getByRole("link", { name: /i need a new app/i }).click();

    await expect(page.getByRole("heading", { name: "Launch New App" })).toBeVisible();
    await page
      .getByText("Public Information Page", { exact: true })
      .locator("..")
      .getByRole("link", { name: "Launch App" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Public Information Page" }),
    ).toBeVisible();
    await expect(page.getByLabel("App Name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Launch App" })).toBeVisible();

    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: "Launch Your App", exact: true }).click();
    await page.getByRole("link", { name: /my app is already on github/i }).click();
    await expect(page).toHaveURL(/\/apps\/add\?source=github$/);
    await expect(page.getByRole("heading", { name: "Already on GitHub" })).toBeVisible();
    await expect(page.getByLabel("GitHub Repository URL")).toBeVisible();

    await page.goto("/onboarding?start=existing");
    await expect(page).toHaveURL(/\/apps\/add\?source=github$/);
    await page.goto("/onboarding?start=local");
    await expect(page).toHaveURL(/\/apps\/add\?source=local$/);
    await expect(page.getByRole("heading", { name: "Only on my computer" })).toBeVisible();
    await expect(page.getByLabel("Local App Name")).toBeVisible();
  });

  test("existing app import stays queued without Azure or GitHub provider calls", async ({
    page,
  }) => {
    await page.goto(`/onboarding/${fixtureIds.pendingImport}`);
    await expect(
      page.getByRole("heading", { name: /your app is queued to be copied/i }),
    ).toBeVisible();
    await expect(page.getByText(/waiting for a protected worker/i)).toBeVisible();
    await expect(page.getByRole("status")).toContainText(/checks import progress/i);
    await expect(page.getByRole("button", { name: /try import again/i })).toHaveCount(0);
  });

  test("new apps reject existing names after typing or blur and allow correction", async ({ page }) => {
    await page.goto("/create/public-information-page");
    const name = page.getByLabel("App Name");
    const feedback = page.locator("form").getByRole("alert");
    await page.getByLabel("Short Description").fill("Preserve this description");
    await name.fill("  e2e published starter  ");
    await expect(feedback).toContainText("That app name is already in use. Please try another name.");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    expect(await name.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(false);

    await name.fill("E2E Starter Awaiting Publish");
    await name.blur();
    await expect(feedback).toContainText("already in use");

    await name.fill("E2E%");
    await expect.poll(() => name.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
    await expect(feedback).toHaveCount(0);
    await expect(page.getByLabel("Short Description")).toHaveValue("Preserve this description");
  });

  test("submits a generated create form and hands the saved request to the wizard", async ({
    page,
  }) => {
    await page.goto("/create/public-information-page");
    await page.getByLabel("App Name").fill(createdAppName);
    await page
      .getByLabel("Short Description")
      .fill("Created through the browser without live provider calls.");
    await page.getByLabel("Openly public on the internet").check();
    await page
      .getByLabel(/I understand that anyone who knows or discovers/i)
      .check();
    await expect.poll(() => page.getByLabel("App Name").evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
    await page.getByLabel("App Name").focus();
    await page.getByRole("button", { name: "Launch App" }).click();

    await expect(page).toHaveURL(/\/onboarding\/[^/?#]+$/);
    const requestId = new URL(page.url()).pathname.split("/").at(-1);
    expect(requestId).toBeTruthy();
    createdRequestIds.push(requestId!);

    await expect(
      page.getByRole("heading", { name: "Your starter app is ready" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish the starter now" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Customize it with Codex first" }),
    ).toBeVisible();

    const request = await prisma.appRequest.findUniqueOrThrow({
      where: { id: requestId! },
      select: {
        appName: true,
        submittedConfig: true,
        repositoryStatus: true,
        repositoryAccessStatus: true,
        publishStatus: true,
      },
    });
    expect(request).toEqual({
      appName: createdAppName,
      submittedConfig: expect.objectContaining({ entraLogin: false }),
      repositoryStatus: "READY",
      repositoryAccessStatus: "NOT_REQUESTED",
      publishStatus: "NOT_STARTED",
    });
  });

  test("resumes unpublished setup and reserves full management for published apps", async ({
    page,
  }) => {
    await page.goto("/apps");

    const unpublishedCard = page
      .getByRole("heading", { name: "E2E Starter Awaiting Publish" })
      .locator("..")
      .locator("..");
    await expect(
      unpublishedCard.getByRole("link", { name: "Continue Setup" }),
    ).toHaveAttribute("href", `/onboarding/${fixtureIds.unpublished}`);

    const publishedCard = page
      .getByRole("heading", { name: "E2E Published Starter" })
      .locator("..")
      .locator("..");
    const publishedManageLink = publishedCard.getByRole("link", {
      name: "E2E Published Starter", exact: true,
    });
    await expect(publishedManageLink).toHaveAttribute(
      "href",
      `/download/${fixtureIds.published}`,
    );

    await unpublishedCard.getByRole("link", { name: "Continue Setup" }).click();
    await expect(
      page.getByRole("heading", { name: "Your starter app is ready" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish the starter now" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Customize it with Codex first" }),
    ).toBeVisible();

    await page.goto("/apps");
    await publishedManageLink.click();
    await expect(page).toHaveURL(`/download/${fixtureIds.published}`);
    await expect(page.getByRole("heading", { name: "E2E Published Starter", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open your app" })).toBeVisible();
  });

  test("navigates App Details sections and stays on the selected section after saving", async ({ page }) => {
    const appPath = `/download/${fixtureIds.published}`;
    await page.goto(appPath);
    const sections = page.getByRole("navigation", { name: "App details sections" });
    await expect(sections.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await sections.getByRole("link", { name: "Deployment", exact: true }).click();
    await expect(page).toHaveURL(appPath + "?section=deployment");
    await expect(page.getByRole("button", { name: "Publish to Azure", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Deployment", exact: true })).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    const picker = page.getByRole("button", { name: "Sections Deployment" });
    await expect(sections).toBeHidden();
    await picker.press("Enter");
    await expect(sections).toBeVisible();
    await sections.getByRole("link", { name: "Cedarville listing", exact: true }).click();
    await expect(page).toHaveURL(appPath + "?section=listing");
    await expect(page.getByRole("button", { name: "Sections Cedarville listing" })).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Share with Cedarville", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove from Cedarville Sharing", exact: true })).toBeVisible();
    await expect(page).toHaveURL(appPath + "?section=listing");

    await page.goBack();
    await expect(page).toHaveURL(appPath + "?section=deployment");
    await expect(picker).toHaveAttribute("aria-expanded", "false");
    await picker.press("Enter");
    await sections.getByText("Advanced", { exact: true }).click();
    await sections.getByRole("link", { name: "Environment variables", exact: true }).click();
    await expect(page).toHaveURL(appPath + "?section=environment");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Environment variables", level: 2 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Environment variables", exact: true }).getByRole("button", { name: "Save Changes" })).toBeVisible();
  });

  test("shows Overview and saved security results without waiting for GitHub", async ({ page }) => {
    const appId = fixtureIds.published;
    const repository = "https://github.com/cedarville-e2e/published-starter";
    const checkedAt = "2026-11-24T12:00:00Z";
    await prisma.appSecurityReview.create({
      data: {
        appRequestId: appId,
        repositoryUrl: repository,
        checkedAt: new Date(checkedAt),
        results: { revision: null, dependency: { checkedAt, alerts: [] }, source: null, checks: [] },
      },
    });
    const release = Promise.withResolvers<void>();
    const requests: string[] = [];
    const firstRefresh = new Date(Date.now() - 3 * 60_000).toISOString();
    const manualRefresh = new Date().toISOString();
    await page.route(`**/api/apps/${appId}/security-review`, async route => {
      const method = route.request().method();
      requests.push(method);
      await release.promise;
      const refreshedAt = method === "POST" ? manualRefresh : firstRefresh;
      const dependency = {
        checkedAt: refreshedAt,
        alerts: [{ number: 1, package: "fixture", advisory: "GHSA-fixture", severity: "high", manifest: "package.json" }],
        updates: [],
      };
      await prisma.appDependencyReview.upsert({
        where: { appRequestId_repository: { appRequestId: appId, repository } },
        create: { appRequestId: appId, repository, checkedAt: new Date(refreshedAt), dependency },
        update: { checkedAt: new Date(refreshedAt), dependency },
      });
      await route.fulfill({ json: { repository, dependency } });
    });

    try {
      await page.goto(`/download/${appId}`);
      await expect(page.getByRole("heading", { name: "Overview", level: 2 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Review security details" })).toBeVisible();
      expect(requests).toEqual([]);

      const sections = page.getByRole("navigation", { name: "App details sections" });
      await sections.getByRole("link", { name: "Security review", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Security review", level: 2 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "The completed checks found no issues" })).toBeVisible();
      await expect(page.getByText(/Checking GitHub for current dependency alerts and updates/)).toBeVisible();
      await expect.poll(() => requests.length).toBeGreaterThan(0);

      release.resolve();
      await expect(page.getByRole("heading", { name: "We found security issues in your app" })).toBeVisible();
      const initialRequests = requests.length;
      await sections.getByRole("link", { name: "Overview", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Overview", level: 2 })).toBeVisible();
      await expect(page.getByText(/3 minutes ago/)).toHaveAttribute("datetime", firstRefresh);
      await sections.getByRole("link", { name: "Security review", exact: true }).click();
      await expect(page.getByRole("heading", { name: "We found security issues in your app" })).toBeVisible();
      await expect(page.getByText(/3 minutes ago/)).toHaveAttribute("datetime", firstRefresh);
      expect(requests).toHaveLength(initialRequests);
      await page.getByRole("button", { name: "Refresh from GitHub" }).click();
      await expect(page.getByText(/just now/)).toHaveAttribute("datetime", manualRefresh);
      expect(requests.at(-1)).toBe("POST");
      const refreshedRequests = requests.length;
      await sections.getByRole("link", { name: "Overview", exact: true }).click();
      await expect(page.getByText(/just now/)).toHaveAttribute("datetime", manualRefresh);
      expect(requests).toHaveLength(refreshedRequests);
    } finally {
      release.resolve();
    }
  });
});
