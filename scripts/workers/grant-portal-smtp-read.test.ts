// @vitest-environment node

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const principal = "11111111-1111-1111-1111-111111111111";
const groupScope = "/subscriptions/test/resourceGroups/rg-cu-app-portal";
const scope = `${groupScope}/providers/Microsoft.Web/sites/cu-app-portal`;

function grant(mode: "create" | "existing" | "broad") {
  const directory = mkdtempSync(join(tmpdir(), "smtp-role-test-"));
  const log = join(directory, "calls.jsonl");
  writeFileSync(join(directory, "az"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const operation = args.slice(0, 3).join(" ");
const role = {
  id: "/subscriptions/test/providers/Microsoft.Authorization/roleDefinitions/role",
  roleType: "CustomRole",
  permissions: [{ dataActions: [], notActions: [], notDataActions: [], actions: [process.env.TEST_MODE === "broad" ? "*" : "Microsoft.Web/sites/config/list/action"] }],
  assignableScopes: [process.env.TEST_GROUP_SCOPE],
};
const assignment = { principalId: process.env.TEST_PRINCIPAL, roleDefinitionId: role.id, scope: process.env.TEST_SCOPE };
const call = { args };
if (operation === "role definition create") call.definition = JSON.parse(fs.readFileSync(args[args.indexOf("--role-definition") + 1], "utf8"));
fs.appendFileSync(process.env.TEST_LOG, JSON.stringify(call) + "\\n");
if (args.slice(0, 2).join(" ") === "webapp show") console.log(JSON.stringify({ id: process.env.TEST_SCOPE }));
else if (operation === "role definition list") console.log(JSON.stringify(process.env.TEST_MODE === "create" ? [] : [role]));
else if (operation === "role definition create") console.log(JSON.stringify(role));
else if (operation === "role assignment list") console.log(JSON.stringify(process.env.TEST_MODE === "existing" || fs.existsSync(process.env.TEST_MARKER) ? [assignment] : []));
else if (operation === "role assignment create") { fs.writeFileSync(process.env.TEST_MARKER, "created"); console.log(JSON.stringify(assignment)); }
else process.exit(2);
`, { mode: 0o755 });
  try {
    const result = spawnSync("node", ["scripts/workers/grant-portal-smtp-read.mjs", principal], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TEST_MODE: mode,
        TEST_LOG: log, TEST_MARKER: join(directory, "created"), TEST_PRINCIPAL: principal,
        TEST_SCOPE: scope, TEST_GROUP_SCOPE: groupScope },
    });
    return { result, calls: readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("portal SMTP CI permission grant", () => {
  it("creates an app-settings-only role and assigns it only on the portal App Service", () => {
    const { result, calls } = grant("create");
    expect(result.status, result.stderr).toBe(0);
    const definition = calls.find((call) => call.definition).definition;
    expect(definition.Actions).toEqual(["Microsoft.Web/sites/config/list/action"]);
    expect(definition.AssignableScopes).toEqual([groupScope]);
    expect(definition.DataActions).toEqual([]);
    const assignment = calls.find((call) => call.args.slice(0, 3).join(" ") === "role assignment create");
    expect(assignment.args).toEqual(expect.arrayContaining([
      "--assignee-object-id", principal, "--assignee-principal-type", "ServicePrincipal", "--scope", scope,
    ]));
    expect(result.stdout).toContain("Verified app-settings read permission");
  });

  it("verifies an existing matching role and assignment without writing", () => {
    const { result, calls } = grant("existing");
    expect(result.status, result.stderr).toBe(0);
    expect(calls.filter((call) => call.args.includes("create"))).toHaveLength(0);
  });

  it("refuses to assign an existing role with broader permissions", () => {
    const { result, calls } = grant("broad");
    expect(result.status).not.toBe(0);
    expect(calls.filter((call) => call.args.includes("create"))).toHaveLength(0);
  });
});
