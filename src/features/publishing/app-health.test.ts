// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { verifyPublishedUrl } from "./azure/verify-deployment";
import { probeMcpDeployment } from "@/features/mcp-servers/deployment-probe";
import { createPublishQueue } from "./queue";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { checkAppHealth, checkDueAppHealth } from "./app-health";
vi.mock("@/lib/db", () => ({ prisma: {
  appRequest: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  publishAttempt: { findFirst: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn(),
} }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("./recovery", () => ({ defaultRecoveryEvidence: { workflow: vi.fn() }, recoveredWarning: (_app: unknown, warning?: string) => warning ?? null }));
vi.mock("./azure/verify-deployment", () => ({ verifyPublishedUrl: vi.fn() }));
vi.mock("@/features/mcp-servers/deployment-probe", () => ({ probeMcpDeployment: vi.fn() }));
vi.mock("./queue", () => ({ createPublishQueue: vi.fn() }));
vi.mock("@/features/repositories/github-app", () => ({ createGitHubAppClient: vi.fn() }));
const attempt = { id: "attempt", status: "FAILED", githubWorkflowRunId: "123", finishedAt: new Date("2026-11-18"), verifiedAt: null };
const app = { id: "app", azureWebAppName: "arkanoid", azureDefaultHostName: "arkanoid.azurewebsites.net", publishStatus: "FAILED", updatedAt: new Date("2026-11-18"), healthCheckedAt: null, healthStatus: "NOT_CHECKED", healthCheckVersion: 0, template: { slug: "web-app" }, publishAttempts: [attempt], primaryPublishUrl: "https://arkanoid.azurewebsites.net", lastPublishedAt: null };
const health = vi.fn();
const workflow = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyPublishedUrl).mockResolvedValue({ verifiedAt: new Date() });
  vi.mocked(prisma.appRequest.findUnique).mockResolvedValue(app as never);
  vi.mocked(prisma.appRequest.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.publishAttempt.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue(attempt as never);
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
  health.mockResolvedValue({ verifiedAt: new Date() });
  workflow.mockResolvedValue({ status: "completed", conclusion: "success" });
});
describe("app health", () => {
  it("recovers a successful rerun and records health without invoking publishing", async () => {
    expect(await checkAppHealth("app", "actor", { health, workflow })).toBe("recovered");
    expect(createPublishQueue).not.toHaveBeenCalled();
    expect(createGitHubAppClient).not.toHaveBeenCalled();
    expect(workflow).toHaveBeenCalledWith(expect.objectContaining({ id: "attempt", appRequest: expect.objectContaining({ id: "app" }) }));
    expect(prisma.publishAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED", verifiedAt: expect.any(Date) }) }));
    const writes = vi.mocked(prisma.appRequest.updateMany).mock.calls;
    expect(writes.some(([arg]) => arg.data.healthStatus === "HEALTHY")).toBe(true);
    expect(writes.some(([arg]) => arg.data.publishStatus === "SUCCEEDED")).toBe(true);
    expect(writes.some(([arg]) => arg.data.lastPublishedAt === attempt.finishedAt)).toBe(false);
  });
  it.each(["failure", "running", "unavailable"])("records healthy availability without recovering a %s workflow", async (state) => {
    if (state === "unavailable") workflow.mockRejectedValue(new Error("GitHub unavailable"));
    else workflow.mockResolvedValue({ status: state === "running" ? "in_progress" : "completed", conclusion: "failure" });
    expect(await checkAppHealth("app", undefined, { health, workflow })).toBe("checked");
    expect(prisma.publishAttempt.updateMany).not.toHaveBeenCalled();
  });
  it("checks the managed Azure host with bounded probes rather than a supplied URL", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({ ...app, publishStatus: "SUCCEEDED", primaryPublishUrl: "http://127.0.0.1/private" } as never);
    await checkAppHealth("app");
    expect(verifyPublishedUrl).toHaveBeenCalledWith("https://arkanoid.azurewebsites.net", { timeoutMs: 5_000 });
  });
  it("uses MCP identity checks in one pass without generic HTTP fallback", async () => {
    const config = { endpointUrl: "https://arkanoid.azurewebsites.net/api/mcp", tenantId: "tenant" };
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({ ...app, publishStatus: "SUCCEEDED", template: { slug: "mcp-server" }, mcpConfiguration: config } as never);
    vi.mocked(probeMcpDeployment).mockResolvedValue({ checkedAt: new Date(), status: "PASSED", currency: "HISTORICAL_ONLY" });
    await checkAppHealth("app");
    expect(probeMcpDeployment).toHaveBeenCalledWith(config, { maxAttempts: 1 });
    expect(verifyPublishedUrl).not.toHaveBeenCalled();
  });
  it("rejects MCP endpoint identity drift without probing it", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({ ...app, publishStatus: "SUCCEEDED", template: { slug: "mcp-server" }, mcpConfiguration: { endpointUrl: "https://other.azurewebsites.net/api/mcp" } } as never);
    await checkAppHealth("app");
    expect(probeMcpDeployment).not.toHaveBeenCalled();
    expect(verifyPublishedUrl).not.toHaveBeenCalled();
  });
  it("skips apps with no provisioned deployment", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({ ...app, azureWebAppName: null } as never);
    expect(await checkAppHealth("app", undefined, { health, workflow })).toBe("skipped");
    expect(health).not.toHaveBeenCalled();
  });
  it("does not guess a run when the failed attempt has no recorded run", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({ ...app, publishAttempts: [{ ...attempt, githubWorkflowRunId: null }] } as never);
    await checkAppHealth("app", undefined, { health, workflow });
    expect(workflow).not.toHaveBeenCalled();
  });
  it("saves failed health with a timestamp without erasing successful publish history", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({ ...app, publishStatus: "SUCCEEDED" } as never);
    health.mockRejectedValue(new Error("unreachable"));
    await checkAppHealth("app", undefined, { health, workflow });
    expect(prisma.appRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ healthStatus: "UNHEALTHY", healthCheckedAt: expect.any(Date) }) }));
    expect(prisma.publishAttempt.updateMany).not.toHaveBeenCalled();
    expect(workflow).not.toHaveBeenCalled();
  });
  it("records root-only success as a warning", async () => {
    health.mockResolvedValue({ verifiedAt: new Date(), warningSummary: "Missing health route" });
    await checkAppHealth("app", undefined, { health, workflow });
    expect(prisma.appRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ healthStatus: "WARNING", healthSummary: "Missing health route" }) }));
  });
  it.each(["QUEUED", "PROVISIONING", "DEPLOYING", "DELETED", "NOT_STARTED"])("skips %s apps", async (publishStatus) => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({ ...app, publishStatus } as never);
    expect(await checkAppHealth("app", undefined, { health, workflow })).toBe("skipped");
    expect(health).not.toHaveBeenCalled();
  });
  it("rejects arbitrary probe hosts", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({ ...app, azureDefaultHostName: "127.0.0.1" } as never);
    expect(await checkAppHealth("app", undefined, { health, workflow })).toBe("checked");
    expect(health).not.toHaveBeenCalled();
    expect(prisma.appRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ healthStatus: "UNHEALTHY", healthCheckedAt: expect.any(Date) }) }));
  });
  it("discards a probe when a publish or another check changed the app", async () => {
    vi.mocked(prisma.appRequest.updateMany).mockResolvedValue({ count: 0 });
    expect(await checkAppHealth("app", undefined, { health, workflow })).toBe("superseded");
    expect(prisma.publishAttempt.updateMany).not.toHaveBeenCalled();
  });
  it("does not rewrite an attempt superseded during the check", async () => {
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue({ id: "new" } as never);
    expect(await checkAppHealth("app", undefined, { health, workflow })).toBe("superseded");
    expect(prisma.publishAttempt.updateMany).not.toHaveBeenCalled();
  });
  it("scans healthy apps after two hours and other apps after five minutes", async () => {
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([]);
    const now = new Date("2026-11-19T18:00:00Z");
    await checkDueAppHealth(now);
    expect(prisma.appRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [
      { healthCheckedAt: null },
      { healthStatus: "HEALTHY", healthCheckedAt: { lte: new Date("2026-11-19T16:00:00Z") } },
      { healthStatus: { not: "HEALTHY" }, healthCheckedAt: { lte: new Date("2026-11-19T17:55:00Z") } },
    ] }), take: 20 }));
  });
  it("continues scanning after a per-app failure", async () => {
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([{ id: "bad" }, { id: "good" }] as never);
    vi.mocked(prisma.appRequest.findUnique).mockRejectedValueOnce(new Error("DB interrupted")).mockResolvedValueOnce(null);
    expect(await checkDueAppHealth()).toEqual({ errors: 1, skipped: 1 });
  });
});
