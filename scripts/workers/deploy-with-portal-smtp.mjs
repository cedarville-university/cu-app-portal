import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function az(args, description) {
  const result = spawnSync("az", [...args, "--only-show-errors"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  // CLI errors can echo request bodies. Report only recognized static codes,
  // never arbitrary error text or submitted settings.
  if (result.status !== 0) {
    const code = result.stderr?.match(/^ERROR: \(([A-Za-z]+)\)/m)?.[1];
    const knownCodes = ["AuthorizationFailed", "LinkedAuthorizationFailed", "Forbidden",
      "RequestDisallowedByAzure", "RequestDisallowedByPolicy", "ResourceNotFound",
      "Conflict", "TooManyRequests", "InvalidParameterValueInContainerTemplate",
      "ContainerAppSecretInvalid", "InvalidIdentityValues", "MissingSubscriptionRegistration"];
    throw new Error(description + (knownCodes.includes(code) ? ` Azure error code: ${code}.` : ""));
  }
  return result.stdout;
}

function azJson(args, description) {
  try {
    return JSON.parse(az([...args, "--output", "json"], description));
  } catch (error) {
    // Preserve our safe CLI diagnostic, but never echo a malformed JSON body.
    if (error instanceof SyntaxError) throw new Error(description);
    throw error;
  }
}

function loadSettings(resourceGroup, appService) {
  const values = azJson([
    "webapp", "config", "appsettings", "list",
    "--resource-group", resourceGroup, "--name", appService,
    "--query", "[?starts_with(name, 'SMTP_')].{name:name,value:value}",
  ], "Cannot read portal SMTP settings. Check CI access to App Service app settings.");
  if (!Array.isArray(values)) throw new Error("Invalid portal SMTP settings response.");
  const settings = new Map();
  for (const { name, value } of values) {
    if (typeof name !== "string" || !/^SMTP_[A-Z0-9_]+$/.test(name) || name.length > 240 ||
        typeof value !== "string" || /[\r\n]/.test(value) || value.startsWith("@Microsoft.KeyVault(")) {
      throw new Error("SMTP settings must be single-line literal values with valid SMTP_* names.");
    }
    // Empty values mean removal, so an old job credential cannot survive.
    if (value === "") continue;
    settings.set(name, value);
  }
  for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_FROM"]) {
    if (!settings.get(name)?.trim()) throw new Error(`The portal must configure ${name}.`);
  }
  const port = Number(settings.get("SMTP_PORT"));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("Invalid portal SMTP_PORT.");
  if (settings.has("SMTP_TLS_MODE") && !["none", "starttls", "ssl"].includes(settings.get("SMTP_TLS_MODE"))) {
    throw new Error("Invalid portal SMTP_TLS_MODE.");
  }
  if (Boolean(settings.get("SMTP_USERNAME")) !== Boolean(settings.get("SMTP_PASSWORD"))) {
    throw new Error("Portal SMTP_USERNAME and SMTP_PASSWORD must be configured together.");
  }
  return settings;
}

// Use the stable ARM contract directly. The CLI YAML updater round-trips
// secrets through its own models and can fail before submitting a job update.
const JOB_API_VERSION = "2025-07-01";

function deploy() {
  const [resourceGroup, appService, image, commit, ...jobs] = process.argv.slice(2);
  if (!resourceGroup || !appService || !image || !commit || !jobs.length) {
    throw new Error("Usage: deploy-with-portal-smtp.mjs <resource-group> <app-service> <image> <commit> <job> [...jobs]");
  }
  const settings = loadSettings(resourceGroup, appService);
  const directory = mkdtempSync(join(tmpdir(), "worker-smtp-"));
  try {
    for (const [index, name] of jobs.entries()) {
      const args = ["--resource-group", resourceGroup, "--name", name];
      const job = azJson(["containerapp", "job", "show", ...args], `Cannot read worker job ${name}.`);
      const container = job.properties?.template?.containers?.[0];
      if (!container || !job.properties.configuration || !job.id) {
        throw new Error(`Invalid worker job definition for ${name}.`);
      }
      container.image = image;
      container.env = (container.env ?? []).filter((item) =>
        !item.name.startsWith("SMTP_") && !["APP_COMMIT_SHA", "CONTAINER_IMAGE_DIGEST"].includes(item.name));
      container.env.push(
        { name: "APP_COMMIT_SHA", value: commit },
        { name: "CONTAINER_IMAGE_DIGEST", value: image.split("@")[1] },
      );
      if (!/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.App\/jobs\/[^/]+$/i.test(job.id)) {
        throw new Error(`Invalid worker job resource ID for ${name}.`);
      }
      const endpoint = `https://management.azure.com${job.id}`;
      const stored = azJson(["rest", "--method", "post", "--url",
        `${endpoint}/listSecrets?api-version=${JOB_API_VERSION}`],
      `Cannot read existing worker secrets for ${name}. No job update was submitted.`);
      if (!Array.isArray(stored.value)) throw new Error(`Invalid worker secret response for ${name}.`);
      const values = new Map(stored.value.map((secret) => [secret.name, secret.value]));
      const secrets = new Map((job.properties.configuration.secrets ?? []).map((secret) => {
        // Never replace a Key Vault reference with its resolved plaintext value.
        if (secret.keyVaultUrl) return [secret.name, {
          name: secret.name, keyVaultUrl: secret.keyVaultUrl, identity: secret.identity,
        }];
        // SMTP entries are replaced below; retain other literal secrets exactly.
        const value = values.get(secret.name);
        if (typeof value !== "string") throw new Error(`Cannot preserve an existing worker secret for ${name}.`);
        return [secret.name, { name: secret.name, value }];
      }));
      for (const [key, value] of settings) {
        const secretName = `portal-${key.toLowerCase().replaceAll("_", "-")}`;
        secrets.set(secretName, { name: secretName, value });
        container.env.push({ name: key, secretRef: secretName });
      }
      job.properties.configuration.secrets = [...secrets.values()];
      // Submit only mutable properties. Keep values out of argv, logs, and
      // GitHub outputs; the Azure CLI reads the body from this private file.
      const payload = {
        location: job.location, tags: job.tags, identity: job.identity,
        properties: {
          configuration: job.properties.configuration,
          template: job.properties.template,
          ...(job.properties.workloadProfileName ? { workloadProfileName: job.properties.workloadProfileName } : {}),
        },
      };
      const path = join(directory, `${index}.json`);
      writeFileSync(path, JSON.stringify(payload), { mode: 0o600 });
      az(["rest", "--method", "patch", "--url", `${endpoint}?api-version=${JOB_API_VERSION}`,
        "--body", `@${path}`, "--output", "none"],
        `Cannot deploy worker job ${name}. Azure error details are suppressed to protect SMTP credentials.`);
      az(["resource", "wait", "--updated", "--ids", job.id, "--interval", "10", "--timeout", "600", "--output", "none"],
        `Worker job ${name} did not finish updating.`);
      const deployed = azJson(["rest", "--method", "get", "--url", `${endpoint}?api-version=${JOB_API_VERSION}`],
        `Cannot verify worker job ${name} after updating.`);
      const actual = deployed.properties?.template?.containers?.[0];
      const actualEnv = new Map((actual?.env ?? []).map((item) => [item.name, item]));
      if (actual?.image !== image || container.env.some((item) => {
        const saved = actualEnv.get(item.name);
        // ARM can omit or null unused fields, including empty literal values.
        return !saved || (saved.value ?? "") !== (item.value ?? "") ||
          (saved.secretRef ?? null) !== (item.secretRef ?? null);
      }) || [...actualEnv.keys()].some((key) => key.startsWith("SMTP_") &&
        !container.env.some((item) => item.name === key))) {
        throw new Error(`Deployed worker job ${name} does not match the requested image and environment.`);
      }
      console.log(`Verified worker job ${name} at commit ${commit}.`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

try {
  deploy();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Worker SMTP deployment failed.");
  process.exitCode = 1;
}
