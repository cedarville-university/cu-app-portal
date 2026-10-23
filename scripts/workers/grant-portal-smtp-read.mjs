import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function az(args) {
  try {
    return JSON.parse(execFileSync("az", [...args, "--output", "json", "--only-show-errors"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch {
    throw new Error(`Azure CLI failed during ${args.slice(0, 3).join(" ")}. Check your login and role-management permissions.`);
  }
}

try {
  const [principalId, group = "rg-cu-app-portal", app = "cu-app-portal"] = process.argv.slice(2);
  if (!principalId || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(principalId)) {
    throw new Error("Usage: node scripts/workers/grant-portal-smtp-read.mjs <CI-service-principal-object-id> [resource-group] [app-service]");
  }
  const site = az(["webapp", "show", "--resource-group", group, "--name", app]);
  const scope = site.id;
  if (typeof scope !== "string" || !/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft.Web\/sites\/[^/]+$/i.test(scope)) {
    throw new Error("Cannot determine the portal App Service scope.");
  }
  const groupScope = scope.slice(0, scope.toLowerCase().indexOf("/providers/"));
  const action = "Microsoft.Web/sites/config/list/action";
  const roleName = `${app} App Settings Reader`;
  const roles = az(["role", "definition", "list", "--name", roleName]);
  let role = roles[0];
  const permission = role?.permissions?.[0];
  if (role && (roles.length !== 1 || role.roleType !== "CustomRole" ||
      role.permissions?.length !== 1 || JSON.stringify(permission?.actions) !== JSON.stringify([action]) ||
      ["notActions", "dataActions", "notDataActions"].some((key) => permission?.[key]?.length) ||
      role.assignableScopes?.length !== 1 || role.assignableScopes[0].toLowerCase() !== groupScope.toLowerCase())) {
    throw new Error("An existing role with this name differs from the expected app-settings-only role. No assignment was made.");
  }
  if (!role) {
    const directory = mkdtempSync(join(tmpdir(), "smtp-reader-role-"));
    try {
      const path = join(directory, "role.json");
      writeFileSync(path, JSON.stringify({
        Name: roleName, IsCustom: true,
        Description: "Read portal App Service settings for worker SMTP deployment synchronization.",
        Actions: [action], NotActions: [], DataActions: [], NotDataActions: [],
        AssignableScopes: [groupScope],
      }), { mode: 0o600 });
      role = az(["role", "definition", "create", "--role-definition", path]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  if (typeof role.id !== "string") throw new Error("Cannot determine the custom role ID.");
  const listArgs = ["role", "assignment", "list", "--scope", scope, "--all"];
  const matches = (assignments) => assignments.some((item) =>
    item.principalId?.toLowerCase() === principalId.toLowerCase() &&
    item.roleDefinitionId?.toLowerCase() === role.id.toLowerCase() &&
    item.scope?.toLowerCase() === scope.toLowerCase());
  if (!matches(az(listArgs))) {
    az(["role", "assignment", "create", "--assignee-object-id", principalId,
      "--assignee-principal-type", "ServicePrincipal", "--role", role.id, "--scope", scope]);
  }
  if (!matches(az(listArgs))) throw new Error("The App Service role assignment could not be verified.");
  console.log(`Verified app-settings read permission for CI principal ${principalId} on ${scope}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Cannot grant portal SMTP read permission.");
  process.exitCode = 1;
}
