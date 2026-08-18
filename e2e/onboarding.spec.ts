import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://portal:portal@localhost:5432/portal?schema=public";
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

const fixtureIds = {
  unpublished: "e2e-onboarding-unpublished",
  published: "e2e-onboarding-published",
};

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
      where: { id: { in: Object.values(fixtureIds) } },
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
  });

  test.afterAll(async () => {
    await prisma.appRequest.deleteMany({
      where: { id: { in: Object.values(fixtureIds) } },
    });
    await prisma.template.deleteMany({
      where: {
        slug: "e2e-onboarding-template",
        appRequests: { none: {} },
      },
    });
    await prisma.$disconnect();
  });

  test("routes new and existing apps to the intended beginner forms", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Create New App", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Choose a starting point" }),
    ).toBeVisible();
    await expect(
      page.getByText(/template gives you a ready-to-customize starting version/i),
    ).toBeVisible();
    await page.getByRole("link", { name: "Choose an app template" }).click();
    await expect(page.getByRole("heading", { name: "Create New App" })).toBeVisible();
    await page.getByRole("link", { name: "Use Public Information Page" }).click();
    await expect(
      page.getByRole("heading", { name: "Public Information Page" }),
    ).toBeVisible();
    await expect(page.getByLabel("App Name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create App" })).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: "Add Existing App", exact: true }).click();
    await expect(page.getByRole("link", { name: "Already on GitHub" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Only on my computer" })).toBeVisible();

    await page.getByRole("link", { name: "Already on GitHub" }).click();
    await expect(page).toHaveURL(/\/apps\/add\?source=github$/);
    await expect(page.getByRole("heading", { name: "Already on GitHub" })).toBeVisible();
    await expect(page.getByLabel("GitHub Repository URL")).toBeVisible();

    await page.goto("/onboarding?start=existing");
    await page.getByRole("link", { name: "Only on my computer" }).click();
    await expect(page).toHaveURL(/\/apps\/add\?source=local#local-app$/);
    await expect(page.getByRole("heading", { name: "Only on my computer" })).toBeVisible();
    await expect(page.getByLabel("Local App Name")).toBeVisible();
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
      name: "Manage App",
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
    await expect(page.getByRole("heading", { name: "Your App Is Ready" })).toBeVisible();
    await expect(page.getByText("E2E Published Starter — Set up Codex, and publish to Azure.")).toBeVisible();
  });
});
