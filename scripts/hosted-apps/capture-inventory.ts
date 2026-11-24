import { capture } from "./capture";

capture().catch(() => {
  console.error("Capture failed. Check the output directory, portal URL and reader access.");
  process.exitCode = 1;
});
