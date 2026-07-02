import { join } from "node:path";
import { loadAthleteConfig } from "../config/load";
import { parseLocalExports } from "../exports/export-scanner";
import { createDailySummary } from "../generator/daily-summary";
import {
  loadJournalInputs,
  mergeDailyNotesPreferJournal,
} from "../parsers/journal";
import { loadManualInputs } from "../parsers/manual-notes";
import type { CheckInCompleteness, DailySummary } from "../types";
import { addDays, formatDate, parseDate } from "../utils/dates";

interface Args {
  evidenceDate: string | null;
}

export interface CheckInValidationResult {
  evidenceDate: string;
  coachingDate: string;
  summary: DailySummary;
  completeness: CheckInCompleteness;
}

export function parseValidateCheckInArgs(argv: string[]): Args {
  let evidenceDate: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--evidence-date") {
      evidenceDate = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return { evidenceDate };
}

export function validateCheckIn(
  cwd: string,
  args: Args,
): CheckInValidationResult {
  if (!args.evidenceDate) {
    throw new Error(
      "Missing --evidence-date. Example: npm run validate:checkin -- --evidence-date 2026-06-27",
    );
  }

  const evidenceDate = formatDate(parseDate(args.evidenceDate));
  const coachingDate = formatDate(addDays(parseDate(evidenceDate), 1));
  const { config } = loadAthleteConfig(cwd);
  const manualInputs = loadManualInputs({
    dailyNotesPath: join(cwd, "input/manual/daily-notes.csv"),
    activityNotesPath: join(cwd, "input/manual/activity-notes.csv"),
    manualActivitiesPath: join(cwd, "input/manual/manual-activities.csv"),
    planNotesPath: join(cwd, "input/manual/plan-notes.md"),
  });
  const exportInputs = parseLocalExports(cwd, { timezone: config.timezone });
  const journalInputs = loadJournalInputs(cwd);

  const summary = createDailySummary({
    date: coachingDate,
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
  });

  return {
    evidenceDate,
    coachingDate,
    summary,
    completeness: summary.checkInCompleteness,
  };
}

export function formatCheckInValidationReport(
  result: CheckInValidationResult,
): string {
  const lines = [
    `Check-in completeness for evidence date ${result.evidenceDate}`,
    "",
    `Status: ${formatStatus(result.completeness.status)}`,
    "",
  ];

  if (result.completeness.missingHighValueFields.length > 0) {
    lines.push("Missing high-value coaching fields:", "");
    lines.push(
      ...result.completeness.missingHighValueFields.map(
        (field) => `* ${field}`,
      ),
    );
    lines.push("");
  } else {
    lines.push("Missing high-value coaching fields:", "");
    lines.push("* None. Key subjective fields provided.", "");
  }

  lines.push("Optional reminders:", "");

  const reminders = [
    ...result.completeness.optionalReminders,
    result.completeness.manualOnlyActivityReminder,
  ].filter((reminder): reminder is string => reminder !== null);

  if (reminders.length === 0) {
    lines.push("* None.");
  } else {
    lines.push(...reminders.map((reminder) => `* ${reminder}`));
  }

  lines.push(
    "",
    "Next step:",
    `Edit input/journal/${result.evidenceDate}.md, then rerun npm run coach -- --evidence-date ${result.evidenceDate}`,
  );

  return lines.join("\n");
}

function formatStatus(status: CheckInCompleteness["status"]): string {
  return status === "complete"
    ? "key subjective fields provided"
    : "needs subjective details";
}

if (require.main === module) {
  try {
    const result = validateCheckIn(
      process.cwd(),
      parseValidateCheckInArgs(process.argv.slice(2)),
    );

    console.log(formatCheckInValidationReport(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
