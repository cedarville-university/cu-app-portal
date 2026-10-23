import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function az(args, description) {
  const result = spawnSync("az", [...args, "--only-show-errors"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  // CLI errors can include the submitted settings. Do not forward their output.
  if (result.status !== 0) throw new Error(description);
  return result.stdout;
}

function azJson(args, description) {
  try {
    return JSON.parse(az([...args, "--output", "json"], description));
  } catch {
    throw new Error(description);
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
      const secrets = new Map((job.properties.configuration.secrets ?? []).map((secret) => [secret.name, secret]));
      for (const [key, value] of settings) {
        const secretName = `portal-${key.toLowerCase().replaceAll("_", "-")}`;
        secrets.set(secretName, { name: secretName, value });
        container.env.push({ name: key, secretRef: secretName });
      }
      job.properties.configuration.secrets = [...secrets.values()];
      // JSON is valid YAML. Keep values out of argv, logs, and GitHub outputs.
      const path = join(directory, `${index}.json`);
      writeFileSync(path, JSON.stringify(job), { mode: 0o600 });
      az(["containerapp", "job", "update", ...args, "--yaml", path, "--output", "none"],
        `Cannot deploy worker job ${name}. Azure error details are suppressed to protect SMTP credentials.`);
      az(["resource", "wait", "--updated", "--ids", job.id, "--interval", "10", "--timeout", "600", "--output", "none"],
        `Worker job ${name} did not finish updating.`);
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
