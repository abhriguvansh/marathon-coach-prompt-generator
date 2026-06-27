import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { loadAthleteConfig } from "../config/load";
import { renderWeeklySummary } from "../generator/weekly-markdown";
import { createWeeklySummary } from "../generator/weekly-summary";
import { loadManualInputs } from "../parsers/manual-notes";
import { getWeekRange, parseDate, formatDate } from "../utils/dates";

interface Args {
  weekStart: string | null;
  preview: boolean;
}

const OUTPUT_PATH = "output/weekly-summary.md";

export function parseGenerateWeeklyArgs(argv: string[]): Args {
  let weekStart: string | null = null;
  let preview = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--week-start") {
      weekStart = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--preview") {
      preview = true;
    }
  }

  return { weekStart, preview };
}

export function generateWeeklySummary(
  cwd: string,
  args: Args,
): { markdown: string; outputPath: string; missingFiles: string[] } {
  if (!args.weekStart) {
    throw new Error(
      "Missing --week-start. Example: npm run generate:weekly -- --week-start 2026-06-22",
    );
  }

  const parsedWeekStart = parseDate(args.weekStart);
  const mondayWeekStart = formatDate(getWeekRange(parsedWeekStart).start);

  if (mondayWeekStart !== args.weekStart) {
    throw new Error(
      `Week start must be a Monday. For ${args.weekStart}, use ${mondayWeekStart}.`,
    );
  }

  const { config } = loadAthleteConfig(cwd);
  const manualInputs = loadManualInputs({
    dailyNotesPath: join(cwd, "input/manual/daily-notes.csv"),
    activityNotesPath: join(cwd, "input/manual/activity-notes.csv"),
    manualActivitiesPath: join(cwd, "input/manual/manual-activities.csv"),
    planNotesPath: join(cwd, "input/manual/plan-notes.md"),
  });
  const summary = createWeeklySummary({
    weekStart: args.weekStart,
    athleteConfig: config,
    dailyNotes: manualInputs.dailyNotes,
    activityNotes: manualInputs.activityNotes,
    manualActivities: manualInputs.manualActivities,
    planNotes: manualInputs.planNotes,
    missingFiles: manualInputs.missingFiles.map((file) => relative(cwd, file)),
  });
  const markdown = renderWeeklySummary(summary);
  const outputPath = join(cwd, OUTPUT_PATH);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown);

  return { markdown, outputPath, missingFiles: manualInputs.missingFiles };
}

if (require.main === module) {
  try {
    const args = parseGenerateWeeklyArgs(process.argv.slice(2));
    const result = generateWeeklySummary(process.cwd(), args);

    if (args.preview) {
      console.log(result.markdown);
    } else {
      console.log(`Generated ${OUTPUT_PATH}`);
    }

    if (result.missingFiles.length > 0) {
      console.log(
        "Some local input files are missing. Copy the .template.csv and .template.md files in input/manual/ before adding real data.",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
