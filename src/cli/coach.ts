import { relative } from "node:path";
import { generateDailyCheckIn } from "./generate-daily";
import {
  formatCheckInValidationReport,
  validateCheckIn,
} from "./validate-checkin";
import { parseLocalExports } from "../exports/export-scanner";
import { loadAthleteConfig } from "../config/load";
import { createJournal } from "../parsers/journal";
import {
  addDays,
  formatDate,
  parseDate,
  subtractDays,
  todayLocalDate,
} from "../utils/dates";

type CoachMode = "explicit" | "tonight" | "morning";

interface CoachArgs {
  mode: CoachMode;
  evidenceDate: string | null;
  coachingDate: string | null;
  includeAthleteBackground: boolean;
}

export interface CoachWorkflowResult {
  evidenceDate: string;
  coachingDate: string;
  journalPath: string;
  journalCreated: boolean;
  importedActivityCount: number;
  outputPath: string;
}

export function parseCoachArgs(argv: string[]): CoachArgs {
  let mode: CoachMode = "explicit";
  let evidenceDate: string | null = null;
  let coachingDate: string | null = null;
  let includeAthleteBackground = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--mode") {
      const value = argv[index + 1];

      if (value !== "tonight" && value !== "morning") {
        throw new Error("Invalid --mode. Expected tonight or morning.");
      }

      mode = value;
      index += 1;
      continue;
    }

    if (arg === "--evidence-date") {
      evidenceDate = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--coaching-date") {
      coachingDate = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--include-athlete-background") {
      includeAthleteBackground = true;
    }
  }

  return { mode, evidenceDate, coachingDate, includeAthleteBackground };
}

export function resolveCoachDates(
  args: CoachArgs,
  now = new Date(),
): { evidenceDate: string; coachingDate: string } {
  if (args.mode === "tonight") {
    const evidenceDate = todayLocalDate(now);

    return {
      evidenceDate,
      coachingDate: formatDate(addDays(parseDate(evidenceDate), 1)),
    };
  }

  if (args.mode === "morning") {
    const coachingDate = todayLocalDate(now);

    return {
      evidenceDate: formatDate(subtractDays(parseDate(coachingDate), 1)),
      coachingDate,
    };
  }

  if (!args.evidenceDate && !args.coachingDate) {
    throw new Error(
      "Missing date. Use npm run coach -- --evidence-date YYYY-MM-DD or npm run coach -- --coaching-date YYYY-MM-DD.",
    );
  }

  const evidenceDate =
    args.evidenceDate ??
    formatDate(subtractDays(parseDate(args.coachingDate ?? ""), 1));
  const coachingDate =
    args.coachingDate ?? formatDate(addDays(parseDate(evidenceDate), 1));

  parseDate(evidenceDate);
  parseDate(coachingDate);
  validateAdjacentDates(evidenceDate, coachingDate);

  return { evidenceDate, coachingDate };
}

export function runCoachWorkflow(input: {
  cwd: string;
  args: CoachArgs;
  now?: Date;
  log?: (message: string) => void;
}): CoachWorkflowResult {
  const log = input.log ?? (() => undefined);
  const { evidenceDate, coachingDate } = resolveCoachDates(
    input.args,
    input.now,
  );

  log("Daily coach workflow");
  log("");
  log(`Evidence date: ${evidenceDate}`);
  log(`Coaching date: ${coachingDate}`);
  log("");
  log("This will:");
  log(`1. Create or reuse input/journal/${evidenceDate}.md`);
  log(`2. Generate output/daily-checkin.md for ${coachingDate}`);
  log(
    input.args.includeAthleteBackground
      ? "Daily check-in mode: full athlete background."
      : "Daily check-in mode: compact. Use --include-athlete-background for standalone/full context.",
  );
  log("");

  const { config } = loadAthleteConfig(input.cwd);
  const exports = parseLocalExports(input.cwd, { timezone: config.timezone });
  const journal = createJournal({
    cwd: input.cwd,
    date: evidenceDate,
    importedActivities: exports.activities,
  });
  const relativeJournalPath = relative(
    input.cwd,
    journal.journalPath,
  ).replaceAll("\\", "/");

  if (journal.created) {
    log(`Journal created at ${relativeJournalPath}.`);
    log(`Imported activity references added: ${journal.importedActivityCount}`);
  } else {
    log(`Journal reused at ${relativeJournalPath}; not overwritten.`);
  }

  log(
    "Add subjective details such as soreness, pain, steps, energy, shoes, and tomorrow constraints.",
  );
  log("Then rerun this command to regenerate the check-in.");
  log("");

  const validation = validateCheckIn(input.cwd, { evidenceDate });
  log(formatCheckInValidationReport(validation));
  log("");

  const daily = generateDailyCheckIn(input.cwd, {
    date: coachingDate,
    preview: false,
    includeAthleteBackground: input.args.includeAthleteBackground,
  });

  log(
    `Generated output/daily-checkin.md for coaching day ${daily.coachingDate} using evidence day ${daily.evidenceDate}.`,
  );

  return {
    evidenceDate,
    coachingDate,
    journalPath: journal.journalPath,
    journalCreated: journal.created,
    importedActivityCount: journal.importedActivityCount,
    outputPath: daily.outputPath,
  };
}

function validateAdjacentDates(
  evidenceDate: string,
  coachingDate: string,
): void {
  const expectedCoachingDate = formatDate(addDays(parseDate(evidenceDate), 1));

  if (coachingDate !== expectedCoachingDate) {
    throw new Error(
      `Evidence date and coaching date must be exactly one day apart. Evidence date ${evidenceDate} expects coaching date ${expectedCoachingDate}, but received ${coachingDate}.`,
    );
  }
}

if (require.main === module) {
  try {
    runCoachWorkflow({
      cwd: process.cwd(),
      args: parseCoachArgs(process.argv.slice(2)),
      log: console.log,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
