// @vitest-environment node

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const settings = [
  { name: "SMTP_HOST", value: "smtp.example.edu" },
  { name: "SMTP_PORT", value: "587" },
  { name: "SMTP_FROM", value: '"CU Launch & Support" <launch@example.edu>' },
  { name: "SMTP_TLS_MODE", value: "starttls" },
  { name: "SMTP_USERNAME", value: "smtp-user" },
  { name: "SMTP_PASSWORD", value: 'a password with "quotes" $() = and spaces' },
  { name: "SMTP_REPLY_TO", value: "support@example.edu" },
  { name: "SMTP_FUTURE_SETTING", value: "also copied" },
];

const job = {
  id: "/subscriptions/test/resourceGroups/portal-rg/providers/Microsoft.App/jobs/test",
  location: "eastus",
  tags: { workload: "worker" },
  identity: { type: "UserAssigned", userAssignedIdentities: { "/identity": {} } },
  properties: {
    environmentId: "/environment",
    configuration: {
      triggerType: "Event",
      secrets: [{ name: "database", keyVaultUrl: "https://vault/secrets/db", identity: "/identity" }],
      eventTriggerConfig: { scale: { maxExecutions: 5 } },
    },
    template: { containers: [{
      name: "worker", image: "old-image", resources: { cpu: 1, memory: "2Gi" },
      env: [
        { name: "DATABASE_URL", secretRef: "database" },
        { name: "SMTP_FROM", value: "Old Sender <old@example.edu>" },
        { name: "SMTP_USERNAME", value: "old-user" },
        { name: "SMTP_PASSWORD", secretRef: "old-password" },
        { name: "SMTP_REPLY_TO", value: "old-reply@example.edu" },
        { name: "SMTP_OLD_SETTING", value: "stale" },
      ],
    }] },
  },
};

for (const workflow of [
  { file: "deploy-publish-worker.yml", step: "Deploy worker and recovery jobs", jobs: ["publish-worker", "publish-recovery"] },
  { file: "deploy-repository-import-worker.yml", step: "Deploy job by digest", jobs: ["import-worker"] },
]) {
  describe(`${workflow.file} SMTP synchronization`, () => {
    function deploy(values = settings, failure = "") {
      const directory = mkdtempSync(join(tmpdir(), "worker-smtp-"));
      const log = join(directory, "calls.jsonl");
      const definition = parse(readFileSync(resolve(".github/workflows", workflow.file), "utf8"));
      const step = definition.jobs.deploy.steps.find((item: { name?: string }) => item.name === workflow.step);
      writeFileSync(join(directory, "az"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const call = { args };
const operation = args.slice(0, 3).join(" ");
if (operation === "containerapp job update" && args.includes("--yaml")) {
  const path = args[args.indexOf("--yaml") + 1];
  call.payload = JSON.parse(fs.readFileSync(path, "utf8"));
  call.fileMode = fs.statSync(path).mode & 0o777;
  call.directoryMode = fs.statSync(require("node:path").dirname(path)).mode & 0o777;
}
fs.appendFileSync(process.env.TEST_AZ_LOG, JSON.stringify(call) + "\\n");
if (args[0] === "webapp") {
  if (process.env.TEST_FAILURE === "read") process.exit(1);
  console.log(process.env.TEST_SETTINGS);
} else if (operation === "containerapp job show") {
  console.log(args.includes("--query") ? JSON.parse(process.env.TEST_JOB).id : process.env.TEST_JOB);
} else if (operation === "containerapp job update" && process.env.TEST_FAILURE === "update") {
  console.error("Azure error containing sensitive setting: " + JSON.parse(process.env.TEST_SETTINGS)[5].value);
  process.exit(1);
} else if (!["containerapp job update", "resource wait --updated"].includes(operation)) {
  process.exit(2);
}
`, { mode: 0o755 });
      try {
        const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", step.run.replaceAll("${{ github.sha }}", "test-sha")], {
          cwd: process.cwd(), encoding: "utf8",
          env: {
            ...process.env, ...definition.env,
            PATH: `${directory}:${process.env.PATH}`,
            AZURE_RESOURCE_GROUP: "portal-rg",
            WORKER_JOB: "publish-worker", RECOVERY_JOB: "publish-recovery", JOB_NAME: "import-worker",
            PINNED_IMAGE: "registry/worker@sha256:test", ACR_LOGIN_SERVER: "registry",
            IMAGE_REPOSITORY: "worker", DIGEST: "sha256:test",
            GITHUB_STEP_SUMMARY: join(directory, "summary"),
            TEST_AZ_LOG: log, TEST_SETTINGS: JSON.stringify(values), TEST_JOB: JSON.stringify(job), TEST_FAILURE: failure,
          },
        });
        const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
        return { result, calls };
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }

    it("copies every SMTP setting to each job as a secret without exposing values", () => {
      const { result, calls } = deploy();
      expect(result.status, result.stderr).toBe(0);
      expect(calls.filter((call) => call.args[0] === "webapp")).toHaveLength(1);
      const updates = calls.filter((call) => call.payload);
      expect(updates).toHaveLength(workflow.jobs.length);
      updates.forEach((call, index) => {
        expect(call.args).toEqual(expect.arrayContaining([workflow.jobs[index], "--output", "none"]));
        expect(call.fileMode).toBe(0o600);
        expect(call.directoryMode).toBe(0o700);
        expect(existsSync(call.args[call.args.indexOf("--yaml") + 1])).toBe(false);
        const container = call.payload.properties.template.containers[0];
        expect(container.image).toBe("registry/worker@sha256:test");
        expect(container.resources).toEqual(job.properties.template.containers[0].resources);
        expect(call.payload.identity).toEqual(job.identity);
        expect(call.payload.properties.configuration.eventTriggerConfig).toEqual(job.properties.configuration.eventTriggerConfig);
        expect(container.env).toContainEqual({ name: "DATABASE_URL", secretRef: "database" });
        expect(call.payload.properties.configuration.secrets).toContainEqual(job.properties.configuration.secrets[0]);
        for (const setting of settings) {
          const variable = container.env.find((item: { name: string }) => item.name === setting.name);
          expect(variable.secretRef).toBeTruthy();
          expect(variable.value).toBeUndefined();
          expect(call.payload.properties.configuration.secrets).toContainEqual({ name: variable.secretRef, value: setting.value });
          expect(call.args.join(" ")).not.toContain(setting.value);
        }
        expect(container.env.find((item: { name: string }) => item.name === "SMTP_OLD_SETTING")).toBeUndefined();
      });
      expect(result.stdout + result.stderr).not.toContain(settings[5].value);
    });

    it.each(["absent", "empty"])("clears stale optional settings when %s in the portal", (state) => {
      const values = state === "absent" ? settings.slice(0, 4) : settings.map((item, index) =>
        index >= 4 ? { ...item, value: "" } : item);
      const { result, calls } = deploy(values);
      expect(result.status, result.stderr).toBe(0);
      for (const call of calls.filter((item) => item.payload)) {
        const names = call.payload.properties.template.containers[0].env.map((item: { name: string }) => item.name);
        expect(names).not.toContain("SMTP_USERNAME");
        expect(names).not.toContain("SMTP_PASSWORD");
        expect(names).not.toContain("SMTP_REPLY_TO");
      }
    });

    it.each(["SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "SMTP_PASSWORD"])(
      "fails before updating jobs if %s is missing", (name) => {
        const { result, calls } = deploy(settings.filter((item) => item.name !== name));
        expect(result.status).not.toBe(0);
        expect(calls.filter((call) => call.args[0] === "containerapp")).toHaveLength(0);
      },
    );

    it.each(["", "   ", "bad\r\nvalue", "@Microsoft.KeyVault(SecretUri=https://vault/secrets/sender)"])(
      "rejects an unusable required setting before updating jobs (%s)", (value) => {
        const values = settings.map((item) => item.name === "SMTP_FROM" ? { ...item, value } : item);
        const { result, calls } = deploy(values);
        expect(result.status).not.toBe(0);
        expect(calls.filter((call) => call.args[0] === "containerapp")).toHaveLength(0);
      },
    );

    it("fails before updating jobs if the portal cannot be read", () => {
      const { result, calls } = deploy(settings, "read");
      expect(result.status).not.toBe(0);
      expect(calls.filter((call) => call.args[0] === "containerapp")).toHaveLength(0);
    });

    it("cleans up the secret file and hides Azure error details on a failed update", () => {
      const { result, calls } = deploy(settings, "update");
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).not.toContain(settings[5].value);
      const update = calls.find((call) => call.payload);
      expect(update).toBeDefined();
      expect(existsSync(update.args[update.args.indexOf("--yaml") + 1])).toBe(false);
    });
  });
}
