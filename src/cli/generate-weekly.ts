import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { loadAthleteConfig } from "../config/load";
import { parseLocalExports } from "../exports/export-scanner";
import { renderWeeklySummary } from "../generator/weekly-markdown";
import { createWeeklySummary } from "../generator/weekly-summary";
import {
  loadJournalInputs,
  mergeDailyNotesPreferJournal,
} from "../parsers/journal";
import { loadManualInputs } from "../parsers/manual-notes";
import type { DailyNote } from "../types";
import { getWeekRange, parseDate, formatDate } from "../utils/dates";
import { stepApprox } from "../utils/steps";

interface Args {
  weekStart: string | null;
  preview: boolean;
  debug: boolean;
}

const OUTPUT_PATH = "output/weekly-checkin.md";

export function parseGenerateWeeklyArgs(argv: string[]): Args {
  let weekStart: string | null = null;
  let preview = false;
  let debug = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--week-start") {
      weekStart = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--preview") {
      preview = true;
      continue;
    }

    if (arg === "--debug") {
      debug = true;
    }
  }

  return { weekStart, preview, debug };
}

export function generateWeeklySummary(
  cwd: string,
  args: Args,
): {
  markdown: string;
  outputPath: string;
  missingFiles: string[];
  weekStart: string;
  weekEnd: string;
  evidenceStart: string;
  evidenceEnd: string;
  debugNotes: string[];
} {
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
  const exportInputs = parseLocalExports(cwd, { timezone: config.timezone });
  const journalInputs = loadJournalInputs(cwd);
  const missingFiles = filterNoisyMissingFiles(
    manualInputs.missingFiles,
    journalInputs.journalEntries.length > 0,
  );
  const dailyNotes = mergeDailyNotesPreferJournal(
    manualInputs.dailyNotes,
    journalInputs.dailyNotes,
  );
  const summary = createWeeklySummary({
    weekStart: args.weekStart,
    athleteConfig: config,
    dailyNotes,
    activityNotes: manualInputs.activityNotes,
    manualActivities: [
      ...manualInputs.manualActivities,
      ...exportInputs.activities,
      ...journalInputs.manualActivities,
    ],
    planNotes: manualInputs.planNotes,
    journalEntries: journalInputs.journalEntries,
    exportWarnings: exportInputs.warnings,
    missingFiles: missingFiles.map((file) => relative(cwd, file)),
  });
  const markdown = renderWeeklySummary(summary);
  const outputPath = join(cwd, OUTPUT_PATH);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown);

  return {
    markdown,
    outputPath,
    missingFiles,
    weekStart: summary.weekStart,
    weekEnd: summary.weekEnd,
    evidenceStart: summary.evidenceStart,
    evidenceEnd: summary.evidenceEnd,
    debugNotes: args.debug ? weeklyDebugNotes(summary) : [],
  };
}

function filterNoisyMissingFiles(
  missingFiles: string[],
  hasJournalEntries: boolean,
): string[] {
  return missingFiles.filter((file) => {
    const normalized = file.replaceAll("\\", "/");

    if (normalized.includes("plan-notes.md")) {
      return false;
    }

    if (hasJournalEntries && normalized.includes("input/manual/")) {
      return false;
    }

    return true;
  });
}

if (require.main === module) {
  try {
    const args = parseGenerateWeeklyArgs(process.argv.slice(2));
    const result = generateWeeklySummary(process.cwd(), args);

    if (args.preview) {
      console.log(result.markdown);
    } else {
      console.log(
        `Generated ${OUTPUT_PATH} for planning week ${result.weekStart} to ${result.weekEnd} using evidence window ${result.evidenceStart} to ${result.evidenceEnd}.`,
      );
    }

    if (args.debug && result.debugNotes.length > 0) {
      console.log("");
      console.log("Debug notes:");
      for (const note of result.debugNotes) {
        console.log(`- ${note}`);
      }
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

function weeklyDebugNotes(
  summary: ReturnType<typeof createWeeklySummary>,
): string[] {
  return summary.activityListByDay.map((day) => {
    const note =
      summary.dailyNotes.find((candidate) => candidate.date === day.date) ??
      null;
    const journalEntry =
      summary.journalEntries.find((candidate) => candidate.date === day.date) ??
      null;
    const steps = note === null ? null : stepApprox(note);
    const runDistance = day.activities
      .filter((activity) => activity.activityType === "run")
      .reduce((total, activity) => total + (activity.distanceMiles ?? 0), 0);
    const runSources = [
      ...new Set(
        day.activities
          .filter((activity) => activity.activityType === "run")
          .map((activity) => activity.distanceSource ?? activity.source),
      ),
    ];
    const hasManualOverride = day.activities.some(
      (activity) =>
        activity.distanceSource === "manual_full_session" ||
        activity.durationSource === "manual_full_session",
    );
    const futureConstraintIncluded = isFutureConstraint(
      journalEntry?.coachNotes ?? null,
    );
    const historicalNoteExcluded =
      journalEntry?.coachNotes !== null &&
      journalEntry?.coachNotes !== undefined &&
      !futureConstraintIncluded;
    const value =
      steps === null
        ? "unavailable"
        : Math.round(steps).toLocaleString("en-US");

    return [
      `Weekly date ${day.date}`,
      `final day type ${day.dayLoadClassification.dayType}`,
      `activities ${formatActivityTypes(day.activities)}`,
      `running distance ${runDistance === 0 ? "0" : Number(runDistance.toFixed(2))} mi`,
      `running distance source ${runSources.length === 0 ? "unavailable" : runSources.join("+")}`,
      `steps ${value}`,
      `steps source ${formatStepSource(note?.stepsSource)}`,
      `confirmed rest ${day.confirmedRest ? "yes" : "no"}`,
      `manual override won ${hasManualOverride ? "yes" : "no"}`,
      `future constraint included ${futureConstraintIncluded ? "yes" : "no"}`,
      `historical note excluded from constraints ${
        historicalNoteExcluded ? "yes" : "no"
      }`,
    ].join("; ");
  });
}

function formatStepSource(source: DailyNote["stepsSource"]): string {
  switch (source) {
    case "journal_manual":
      return "manual_journal";
    case "manual_csv":
      return "manual_csv";
    case "garmin_daily_export":
      return "garmin_daily_summary";
    case "strava_daily_export":
      return "strava_daily_export";
    case "unknown":
    case null:
    case undefined:
      return "unavailable";
    default:
      return source;
  }
}

function formatActivityTypes(
  activities: ReturnType<
    typeof createWeeklySummary
  >["activityListByDay"][number]["activities"],
): string {
  if (activities.length === 0) {
    return "none";
  }

  return activities
    .map((activity) => activity.activityType)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join("+");
}

function isFutureConstraint(value: string | null): boolean {
  if (value === null) {
    return false;
  }

  const normalized = value.toLowerCase();

  if (
    /\b(today|tonight|yesterday|this morning|this afternoon|this evening)\b/.test(
      normalized,
    ) &&
    !/\b(tomorrow|upcoming|next|future|later this week|this weekend)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  if (
    /\b(no run|no running|no activity|rest day|rested)\b/.test(normalized) &&
    !/\b(tomorrow|upcoming|next|future|planned|scheduled|travel|trip|appointment)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  return [
    "travel",
    "trip",
    "no-running",
    "no running",
    "tomorrow",
    "upcoming",
    "appointment",
    "schedule",
    "scheduled",
    "constraint",
    "busy",
    "work",
    "school",
    "amusement",
    "park",
    "race",
    "event",
    "logistics",
    "weather",
  ].some((term) => normalized.includes(term));
}
