import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  EXAMPLE_ATHLETE_CONFIG_PATH,
  LOCAL_ATHLETE_CONFIG_PATH,
} from "../config";
import { PRIVATE_DATA_WARNING } from "../privacy";

interface Check {
  label: string;
  path: string;
}

const checks: Check[] = [
  { label: "Example athlete config", path: EXAMPLE_ATHLETE_CONFIG_PATH },
  { label: "Local athlete config", path: LOCAL_ATHLETE_CONFIG_PATH },
  {
    label: "Daily notes template",
    path: "input/manual/daily-notes.template.csv",
  },
  {
    label: "Activity notes template",
    path: "input/manual/activity-notes.template.csv",
  },
  {
    label: "Manual activities template",
    path: "input/manual/manual-activities.template.csv",
  },
  { label: "Plan notes template", path: "input/manual/plan-notes.template.md" },
  { label: "Private folder", path: "private" },
  { label: "Manual input folder", path: "input/manual" },
  { label: "Garmin input folder", path: "input/garmin" },
  { label: "Strava input folder", path: "input/strava" },
  { label: "Output folder", path: "output" },
];

export function inspectProject(cwd = process.cwd()): string {
  const lines = ["Marathon Coach Prompt Generator Inspect", ""];

  for (const check of checks) {
    const exists = existsSync(join(cwd, check.path));
    lines.push(`${exists ? "OK" : "MISSING"} ${check.label}: ${check.path}`);
  }

  lines.push("", PRIVATE_DATA_WARNING);
  lines.push(
    "Inspect reports file presence only and does not print private file contents.",
  );

  return lines.join("\n");
}

if (require.main === module) {
  console.log(inspectProject());
}
