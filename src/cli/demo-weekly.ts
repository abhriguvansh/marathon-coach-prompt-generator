import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  demoActivityNotes,
  demoAthleteConfig,
  demoDailyNotes,
  demoManualActivities,
  demoPlanNotes,
} from "../demo/fake-data";
import { renderWeeklySummary } from "../generator/weekly-markdown";
import { createWeeklySummary } from "../generator/weekly-summary";

const DEMO_OUTPUT_PATH = "examples/demo-weekly-summary.md";

export function generateDemoWeekly(cwd = process.cwd()): string {
  const summary = createWeeklySummary({
    weekStart: "2026-06-29",
    athleteConfig: demoAthleteConfig,
    dailyNotes: demoDailyNotes,
    activityNotes: demoActivityNotes,
    manualActivities: demoManualActivities,
    planNotes: demoPlanNotes,
  });
  const markdown = [
    "<!-- Public-safe fake demo output. Do not replace with real training data. -->",
    "",
    renderWeeklySummary(summary),
  ].join("\n");
  const outputPath = join(cwd, DEMO_OUTPUT_PATH);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown);

  return markdown;
}

if (require.main === module) {
  generateDemoWeekly();
  console.log(`Generated ${DEMO_OUTPUT_PATH} from fake demo data.`);
}
