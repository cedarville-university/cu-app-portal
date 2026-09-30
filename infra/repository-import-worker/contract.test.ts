// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const base = resolve(process.cwd(), "infra/repository-import-worker");
const read = (path: string) => readFileSync(resolve(base, path), "utf8");
const all = () =>
  [
    "main.bicep",
    "modules/registry.bicep",
    "modules/messaging.bicep",
    "modules/identity.bicep",
    "modules/job.bicep",
    "modules/monitoring.bicep",
  ]
    .map(read)
    .join("\n");

describe("repository import worker infrastructure contract", () => {
  it("defines the required managed Azure resources", () => {
    const source = all();
    for (const type of [
      "Microsoft.ContainerRegistry/registries",
      "Microsoft.ServiceBus/namespaces",
      "queues",
      "Microsoft.App/managedEnvironments",
      "Microsoft.App/jobs",
      "Microsoft.ManagedIdentity/userAssignedIdentities",
      "Microsoft.KeyVault/vaults",
      "Microsoft.OperationalInsights/workspaces",
      "Microsoft.Insights/metricAlerts",
    ]) {
      expect(source).toContain(type);
    }
  });

  it("uses the subscription-supported basic registry without premium retention", () => {
    const registry = read("modules/registry.bicep");
    expect(registry).toContain("name: 'Basic'");
    expect(registry).not.toContain("retentionPolicy:");
  });

  it("does not use the reserved Service Bus namespace suffix", () => {
    const main = read("main.bicep");
    expect(main).toContain("var namespaceName = take('${namePrefix}-sb-${suffix}', 50)");
  });

  it("supports a two-phase bootstrap before Key Vault references are validated", () => {
    const main = read("main.bicep");
    expect(main).toContain("param deployJob bool = true");
    expect(main).toContain("module job 'modules/job.bicep' = if (deployJob)");
    expect(main).toContain("output jobName string = jobName");
  });

  it("bounds queue delivery and job concurrency/resources", () => {
    const source = all();
    expect(source).toMatch(/maxDeliveryCount:\s*5/);
    expect(source).toMatch(/maxExecutions:\s*5/);
    expect(source).toMatch(/replicaTimeout:\s*1800/);
    expect(source).toMatch(/replicaCompletionCount:\s*1/);
    expect(source).toMatch(/cpu:\s*json\('1'\)/);
    expect(source).toMatch(/memory:\s*'2Gi'/);
    expect(source).toMatch(/messageCount:\s*'1'/);
  });

  it("uses queue-scoped and resource-scoped least-privilege roles", () => {
    const source = all();
    expect(source).toContain("69a216fc-b8fb-44d8-bc22-1f3c2cd27a39");
    expect(source).toContain("4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0");
    expect(source).toContain("4633458b-17de-408a-b874-0445c86b69e6");
    expect(source).toContain("7f951dda-4ed3-4680-a7ca-43fe172d538d");
    expect(source).not.toMatch(/\bOwner\b|\bContributor\b/);
    expect(source).not.toMatch(/Microsoft\.App\/jobs\/\*/);
  });

  it("accepts no secret values and emits deployment handoff outputs", () => {
    const main = read("main.bicep");
    expect(main).not.toMatch(/@secure\(\)\s*param/);
    for (const output of [
      "serviceBusNamespace",
      "serviceBusQueue",
      "acrLoginServer",
      "jobName",
      "workerIdentityId",
      "pullIdentityId",
      "keyVaultUri",
      "logAnalyticsWorkspaceId",
    ]) {
      expect(main).toContain(`output ${output} `);
    }
  });
});
