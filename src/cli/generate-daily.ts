import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadAthleteConfig } from "../config/load";
import { parseLocalExports } from "../exports/export-scanner";
import { createDailySummary, previousDate } from "../generator/daily-summary";
import { renderDailyCheckIn } from "../generator/daily-markdown";
import {
  type JournalInputs,
  loadJournalInputs,
  mergeDailyNotesPreferJournal,
} from "../parsers/journal";
import { loadManualInputs } from "../parsers/manual-notes";
import type { AthleteConfig, DailySummary, ExportParseResult } from "../types";
import { parseDate } from "../utils/dates";

interface Args {
  date: string | null;
  preview: boolean;
  includeAthleteBackground: boolean;
}

const OUTPUT_PATH = "output/daily-checkin.md";

export interface DailyCheckInInputState {
  config: AthleteConfig;
  manualInputs: ReturnType<typeof loadManualInputs>;
  exportInputs: ExportParseResult;
  journalInputs: JournalInputs;
}

export function parseGenerateDailyArgs(argv: string[]): Args {
  let date: string | null = null;
  let preview = false;
  let includeAthleteBackground = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--date") {
      date = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--preview") {
      preview = true;
      continue;
    }

    if (arg === "--include-athlete-background") {
      includeAthleteBackground = true;
    }
  }

  return { date, preview, includeAthleteBackground };
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
  const inputState = loadDailyCheckInInputState(cwd);
  const result = generateDailyCheckInFromInputState(cwd, args, inputState);

  return result;
}

export function loadDailyCheckInInputState(
  cwd: string,
  options: {
    config?: AthleteConfig;
    exportInputs?: ExportParseResult;
  } = {},
): DailyCheckInInputState {
  const resolvedConfig = options.config ?? loadAthleteConfig(cwd).config;

  return {
    config: resolvedConfig,
    manualInputs: loadManualInputs({
      dailyNotesPath: join(cwd, "input/manual/daily-notes.csv"),
      activityNotesPath: join(cwd, "input/manual/activity-notes.csv"),
      manualActivitiesPath: join(cwd, "input/manual/manual-activities.csv"),
      planNotesPath: join(cwd, "input/manual/plan-notes.md"),
    }),
    exportInputs:
      options.exportInputs ??
      parseLocalExports(cwd, {
        timezone: resolvedConfig.timezone,
      }),
    journalInputs: loadJournalInputs(cwd),
  };
}

export function generateDailyCheckInFromInputState(
  cwd: string,
  args: Args,
  inputState: DailyCheckInInputState,
): {
  markdown: string;
  outputPath: string;
  missingFiles: string[];
  coachingDate: string;
  evidenceDate: string;
  summary: DailySummary;
} {
  if (!args.date) {
    throw new Error(
      "Missing --date. This is the coaching day. Example: after journaling 2026-06-27, run npm run generate:daily -- --date 2026-06-28",
    );
  }

  parseDate(args.date);
  const evidenceDate = previousDate(args.date);

  const hasEvidenceJournal = inputState.journalInputs.journalEntries.some(
    (entry) => entry.date === evidenceDate,
  );
  const missingFiles = filterNoisyMissingFiles(
    inputState.manualInputs.missingFiles,
    hasEvidenceJournal,
  );

  const summary = createDailySummary({
    date: args.date,
    athleteConfig: inputState.config,
    dailyNotes: mergeDailyNotesPreferJournal(
      inputState.manualInputs.dailyNotes,
      inputState.journalInputs.dailyNotes,
    ),
    activityNotes: inputState.manualInputs.activityNotes,
    manualActivities: [
      ...inputState.manualInputs.manualActivities,
      ...inputState.exportInputs.activities,
      ...inputState.journalInputs.manualActivities,
    ],
    planNotes: inputState.manualInputs.planNotes,
    journalEntries: inputState.journalInputs.journalEntries,
    exportWarnings: inputState.exportInputs.warnings,
    missingFiles: missingFiles.map((file) =>
      file.replace(`${cwd}\\`, "").replace(`${cwd}/`, ""),
    ),
  });
  const markdown = renderDailyCheckIn(summary, {
    includeAthleteBackground: args.includeAthleteBackground,
  });
  const outputPath = join(cwd, OUTPUT_PATH);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown);

  return {
    markdown,
    outputPath,
    missingFiles,
    coachingDate: args.date,
    evidenceDate,
    summary,
  };
}

function filterNoisyMissingFiles(
  missingFiles: string[],
  hasEvidenceJournal: boolean,
): string[] {
  return missingFiles.filter((file) => {
    const normalized = file.replaceAll("\\", "/");

    if (normalized.includes("plan-notes.md")) {
      return false;
    }

    if (hasEvidenceJournal && normalized.includes("input/manual/")) {
      return false;
    }

    return true;
  });
}

if (require.main === module) {
  try {
    const args = parseGenerateDailyArgs(process.argv.slice(2));
    const result = generateDailyCheckIn(process.cwd(), args);

    if (args.preview) {
      console.log(result.markdown);
    } else {
      console.log(
        args.includeAthleteBackground
          ? "Daily check-in mode: full athlete background."
          : "Daily check-in mode: compact. Use --include-athlete-background for standalone/full context.",
      );
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
