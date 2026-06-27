import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadAthleteConfig } from "../config/load";
import { parseLocalExports } from "../exports/export-scanner";
import { createDailySummary, previousDate } from "../generator/daily-summary";
import { renderDailyCheckIn } from "../generator/daily-markdown";
import {
  loadJournalInputs,
  mergeDailyNotesPreferJournal,
} from "../parsers/journal";
import { loadManualInputs } from "../parsers/manual-notes";
import { parseDate } from "../utils/dates";

interface Args {
  date: string | null;
  preview: boolean;
}

const OUTPUT_PATH = "output/daily-checkin.md";

export function parseGenerateDailyArgs(argv: string[]): Args {
  let date: string | null = null;
  let preview = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--date") {
      date = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--preview") {
      preview = true;
    }
  }

  return { date, preview };
}

export function generateDailyCheckIn(
  cwd: string,
  args: Args,
): {
  markdown: string;
  outputPath: string;
  missingFiles: string[];
  coachingDate: string;
  evidenceDate: string;
} {
  if (!args.date) {
    throw new Error(
      "Missing --date. This is the coaching day. Example: after journaling 2026-06-27, run npm run generate:daily -- --date 2026-06-28",
    );
  }

  parseDate(args.date);
  const evidenceDate = previousDate(args.date);

  const { config } = loadAthleteConfig(cwd);
  const manualInputs = loadManualInputs({
    dailyNotesPath: join(cwd, "input/manual/daily-notes.csv"),
    activityNotesPath: join(cwd, "input/manual/activity-notes.csv"),
    manualActivitiesPath: join(cwd, "input/manual/manual-activities.csv"),
    planNotesPath: join(cwd, "input/manual/plan-notes.md"),
  });
  const exportInputs = parseLocalExports(cwd);
  const journalInputs = loadJournalInputs(cwd);

  const summary = createDailySummary({
    date: args.date,
    athleteConfig: config,
    dailyNotes: mergeDailyNotesPreferJournal(
      manualInputs.dailyNotes,
      journalInputs.dailyNotes,
    ),
    activityNotes: manualInputs.activityNotes,
    manualActivities: [
      ...manualInputs.manualActivities,
      ...exportInputs.activities,
      ...journalInputs.manualActivities,
    ],
    planNotes: manualInputs.planNotes,
    journalEntries: journalInputs.journalEntries,
    exportWarnings: exportInputs.warnings,
    missingFiles: manualInputs.missingFiles.map((file) =>
      file.replace(`${cwd}\\`, "").replace(`${cwd}/`, ""),
    ),
  });
  const markdown = renderDailyCheckIn(summary);
  const outputPath = join(cwd, OUTPUT_PATH);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown);

  return {
    markdown,
    outputPath,
    missingFiles: manualInputs.missingFiles,
    coachingDate: args.date,
    evidenceDate,
  };
}

if (require.main === module) {
  try {
    const args = parseGenerateDailyArgs(process.argv.slice(2));
    const result = generateDailyCheckIn(process.cwd(), args);

    if (args.preview) {
      console.log(result.markdown);
    } else {
      console.log(
        `Generated ${OUTPUT_PATH} for coaching day ${result.coachingDate} using evidence day ${result.evidenceDate}.`,
      );
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
