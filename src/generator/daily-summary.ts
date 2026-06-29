import type {
  ActivityNote,
  AthleteConfig,
  DailyNote,
  DailySummary,
  ExportParseWarning,
  JournalEntry,
  ManualActivity,
  MissingDataFlag,
  SafetyFlag,
} from "../types";
import { daysUntilRace, formatDate, parseDate } from "../utils/dates";
import { classifyActivities, sumMileage } from "./activity-classification";
import { evaluateCheckInCompleteness } from "./checkin-completeness";
import { analyzeActivityDuplicates } from "./duplicate-detection";

export function previousDate(date: string): string {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return formatDate(parsed);
}

export function createDailySummary(input: {
  date: string;
  athleteConfig: AthleteConfig;
  dailyNotes: DailyNote[];
  activityNotes: ActivityNote[];
  manualActivities: ManualActivity[];
  planNotes: string | null;
  journalEntries?: JournalEntry[];
  missingFiles?: string[];
  exportWarnings?: ExportParseWarning[];
}): DailySummary {
  const evidenceDate = previousDate(input.date);
  const dailyNote =
    input.dailyNotes.find((note) => note.date === evidenceDate) ?? null;
  const activityNotes = input.activityNotes.filter(
    (note) => note.date === evidenceDate,
  );
  const manualActivities = input.manualActivities.filter(
    (activity) => activity.date === evidenceDate,
  );
  const duplicateAnalysis = analyzeActivityDuplicates(manualActivities);
  const journalEntry =
    (input.journalEntries ?? []).find((entry) => entry.date === evidenceDate) ??
    null;

  const groups = classifyActivities(duplicateAnalysis.activitiesForTotals);

  const runningMileage = sumMileage(groups.runs);
  const walkingMileage = sumMileage(groups.walks);

  const summaryWithoutCompleteness = {
    date: input.date,
    evidenceDate,
    athleteConfig: input.athleteConfig,
    dailyNote,
    activityNotes,
    manualActivities,
    planNotes: input.planNotes,
    journalEntry,
    exportWarnings: input.exportWarnings ?? [],
    duplicateWarnings: duplicateAnalysis.warnings,
    daysUntilRace: daysUntilRace(
      parseDate(input.date),
      parseDate(input.athleteConfig.race.date),
    ),
    runningMileage,
    walkingMileage,
    runs: groups.runs,
    walks: groups.walks,
    rockClimbing: groups.rockClimbing,
    tennis: groups.tennis,
    weights: groups.weights,
    mobility: groups.mobility,
    restOrOther: groups.restOrOther,
    safetyFlags: buildSafetyFlags(dailyNote, activityNotes),
    missingDataFlags: buildMissingDataFlags({
      dailyNote,
      manualActivities,
      activityNotes,
      planNotes: input.planNotes,
      missingFiles: input.missingFiles ?? [],
      exportWarnings: input.exportWarnings ?? [],
      duplicateWarnings: duplicateAnalysis.warnings,
      journalEntry,
    }),
  };

  return {
    ...summaryWithoutCompleteness,
    checkInCompleteness: evaluateCheckInCompleteness(
      summaryWithoutCompleteness,
    ),
  };
}

function buildSafetyFlags(
  dailyNote: DailyNote | null,
  activityNotes: ActivityNote[],
): SafetyFlag[] {
  const flags: SafetyFlag[] = [];

  if (!dailyNote) {
    return flags;
  }

  if (dailyNote.pain !== null && dailyNote.pain >= 4) {
    flags.push({
      level: "concern",
      message: `Pain is ${dailyNote.pain}/10, which meets the concern threshold.`,
    });
  }

  if (containsConcern(dailyNote.painType, ["sharp"])) {
    flags.push({ level: "concern", message: "Pain type includes sharp pain." });
  }

  if (containsConcern(dailyNote.painLocation, ["left", "right", "one-sided"])) {
    flags.push({
      level: "concern",
      message: "Pain location may be one-sided.",
    });
  }

  if (dailyNote.gaitChanged === true) {
    flags.push({
      level: "concern",
      message: "Gait changed is marked true.",
    });
  }

  const notes = [
    dailyNote.notes,
    ...activityNotes.map((activityNote) => activityNote.painNotes),
  ]
    .filter((value): value is string => value !== null)
    .join(" ");

  if (containsConcern(notes, ["worse", "worsening", "increasing"])) {
    flags.push({
      level: "concern",
      message: "Notes suggest pain may be worsening.",
    });
  }

  return flags;
}

function containsConcern(value: string | null, terms: string[]): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();

  return terms.some((term) => normalized.includes(term));
}

function buildMissingDataFlags(input: {
  dailyNote: DailyNote | null;
  manualActivities: ManualActivity[];
  activityNotes: ActivityNote[];
  planNotes: string | null;
  missingFiles: string[];
  exportWarnings: Array<{ message: string }>;
  duplicateWarnings: Array<{ message: string; excludedFromTotals: boolean }>;
  journalEntry: JournalEntry | null;
}): MissingDataFlag[] {
  const flags: MissingDataFlag[] = [];
  const hasJournalEntry = input.journalEntry !== null;

  for (const missingFile of input.missingFiles) {
    const normalized = missingFile.replaceAll("\\", "/");

    if (normalized.includes("plan-notes.md")) {
      continue;
    }

    if (hasJournalEntry && isLegacyManualPath(normalized)) {
      continue;
    }

    flags.push({
      field: missingFile,
      message: `Missing local input file: ${missingFile}. Copy the matching template file before adding real data.`,
    });
  }

  for (const exportWarning of input.exportWarnings) {
    flags.push({
      field: "local exports",
      message: `Export data-quality note: ${exportWarning.message}`,
    });
  }

  for (const duplicateWarning of input.duplicateWarnings) {
    flags.push({
      field: "activity duplicates",
      message: `Duplicate data-quality note: ${duplicateWarning.message}`,
    });
  }

  if (!input.dailyNote) {
    flags.push({
      field: "daily-notes.csv",
      message: "No daily note found for yesterday.",
    });
  }

  if (input.manualActivities.length === 0) {
    flags.push({
      field: "manual-activities.csv",
      message: "No manual activities found for yesterday.",
    });
  }

  if (input.activityNotes.length === 0 && !hasJournalEntry) {
    flags.push({
      field: "activity-notes.csv",
      message: "No activity notes found for yesterday.",
    });
  }

  return flags;
}

function isLegacyManualPath(path: string): boolean {
  return (
    path.includes("input/manual/daily-notes.csv") ||
    path.includes("input/manual/activity-notes.csv") ||
    path.includes("input/manual/manual-activities.csv") ||
    path.includes("input/manual/plan-notes.md")
  );
}
