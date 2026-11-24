import { readFileSync } from "node:fs";
import { reviewFixture } from "./fixture-review";
import { followUp } from "./follow-up";

function main() {
  const [file, digest, deploymentId, previous] = process.argv.slice(2);
  if (!file || !digest || !deploymentId) throw new Error("Expected fixture path, SHA-256 and deployment ID.");
  const report = reviewFixture(readFileSync(file), digest, deploymentId, new Date().toISOString());
  const findings = previous ? followUp(report, JSON.parse(readFileSync(previous, "utf8"))) : undefined;
  const expected = previous ? "pass" : "finding";
  const tested = report.pilot[0].checks.filter(c => !["entra-sign-in", "chrome-login"].includes(c.rule));
  if (tested.length !== 5 || tested.some(c => c.outcome !== expected) ||
    (findings && (findings.length !== 5 || findings.some(f => f.status !== "verified-fixed")))) {
    throw new Error("Unexpected pilot result.");
  }
  console.log(JSON.stringify({ ...report, findings }));
}
main();
