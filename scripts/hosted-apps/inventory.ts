import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { inventory } from "./report";
import { reviewPilot } from "./review";
import { followUp } from "./follow-up";

async function json(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function main() {
  const { values } = parseArgs({ options: {
    portal: { type: "string" }, azure: { type: "string" }, evidence: { type: "string" }, previous: { type: "string" },
    "save-security-reviews": { type: "boolean" }, "report-only": { type: "boolean" },
  } });
  if (!values.portal || !values.azure) throw new Error("Expected --portal and --azure metadata exports.");
  if (values["save-security-reviews"] && (!values.evidence || values["report-only"])) {
    throw new Error("Conflicting save options or missing evidence.");
  }
  const report = inventory(await json(values.portal), await json(values.azure));
  const pilot = values.evidence ? reviewPilot(report, await json(values.evidence)) : undefined;
  if (values.previous && !pilot) throw new Error("Previous results require current pilot evidence.");
  const findings = values.previous && pilot ? followUp({ pilot }, await json(values.previous)) : undefined;
  process.stdout.write(JSON.stringify({ ...report, pilot, findings }, null, 2) + "\n");
  if (!report.complete) {
    process.exitCode = 2;
    return;
  }
  if (pilot && !values["report-only"]) {
    try {
      const { saveSecurityReviews } = await import("./save-security-reviews");
      const saved = await saveSecurityReviews(report, pilot);
      console.error(`Saved ${saved} of ${pilot.length} app security reviews to CU Launch.`);
    } catch {
      console.error("The report was generated, but saving to CU Launch failed. Check the portal database connection and migration, then retry with the same inputs.");
      process.exitCode = 1;
    }
  }
}

main().catch(() => {
  console.error("Unable to read the pilot exports. Check paths, schemas and conflicting source identities.");
  process.exitCode = 1;
});
