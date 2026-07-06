import type {
  ActivityNote,
  AthleteConfig,
  DailyNote,
  ExportParseWarning,
  JournalEntry,
  ManualActivity,
  WeeklySummary,
} from "../types";
import {
  addDays,
  daysUntilRace,
  formatDate,
  isDateWithinRange,
  parseDate,
} from "../utils/dates";
import { numericRecoveryValue } from "../utils/recovery";
import { enrichRunWalkStructures } from "../utils/run-walk";
import { isHighStepNote, stepApprox } from "../utils/steps";
import { applyJournalFullSessionOverrides } from "./activity-overrides";
import {
  classifyActivities,
  sumDurationMinutes,
  sumMileage,
} from "./activity-classification";
import { classifyDayLoad, hasExplicitRest } from "./day-classification";
import { analyzeActivityDuplicates } from "./duplicate-detection";
import { buildWeeklyRecoveryTrendFlags } from "./recovery-trends";

export function createWeeklySummary(input: {
  weekStart: string;
  athleteConfig: AthleteConfig;
  dailyNotes: DailyNote[];
  activityNotes: ActivityNote[];
  manualActivities: ManualActivity[];
  planNotes: string | null;
  journalEntries?: JournalEntry[];
  missingFiles?: string[];
  exportWarnings?: ExportParseWarning[];
}): WeeklySummary {
  const weekEnd = formatDate(addDays(parseDate(input.weekStart), 6));
  const evidenceStart = formatDate(addDays(parseDate(input.weekStart), -7));
  const evidenceEnd = formatDate(addDays(parseDate(input.weekStart), -1));
  const dailyNotes = canonicalDailyNotesByDate(input.dailyNotes).filter(
    (note) => isDateWithinRange(note.date, evidenceStart, evidenceEnd),
  );
  const activityNotes = input.activityNotes.filter((note) =>
    isDateWithinRange(note.date, evidenceStart, evidenceEnd),
  );
  const journalEntries = (input.journalEntries ?? []).filter((entry) =>
    isDateWithinRange(entry.date, evidenceStart, evidenceEnd),
  );
  const manualActivities = enrichWeeklyRunWalkStructures(
    applyJournalFullSessionOverrides(
      input.manualActivities.filter((activity) =>
        isDateWithinRange(activity.date, evidenceStart, evidenceEnd),
      ),
    ),
    activityNotes,
    dailyNotes,
    journalEntries,
  );
  const duplicateAnalysis = analyzeActivityDuplicates(manualActivities);
  const activitiesForTotals = duplicateAnalysis.activitiesForTotals;
  const groups = classifyActivities(activitiesForTotals);
  const runningMileage = sumMileage(groups.runs);
  const walkingMileage = sumMileage(groups.walks);
  const runningDurationMinutes = sumDurationMinutes(groups.runs);
  const walkingDurationMinutes = sumDurationMinutes(groups.walks);
  const recoveryTrendFlags = buildWeeklyRecoveryTrendFlags({
    dailyNotes,
    manualActivities,
  });

  const activityListByDay = buildActivityListByDay(
    evidenceStart,
    evidenceEnd,
    manualActivities,
    dailyNotes,
    journalEntries,
  );
  const totals = {
    runningMileage,
    walkingMileage,
    totalActiveMileage: runningMileage + walkingMileage,
    runningDurationMinutes,
    walkingDurationMinutes,
    runCount: groups.runs.length,
    walkCount: groups.walks.length,
    rockClimbingCount: groups.rockClimbing.length,
    tennisCount: groups.tennis.length,
    weightsCount: groups.weights.length,
    mobilityRestOtherCount: groups.mobility.length + groups.restOrOther.length,
    totalSteps: sumNullable(dailyNotes.map((note) => stepApprox(note))),
    averageDailySteps: averageNullable(
      dailyNotes.map((note) => stepApprox(note)),
    ),
    stepDaysWithData: dailyNotes.filter((note) => stepApprox(note) !== null)
      .length,
    highStepDays: dailyNotes.filter((note) => isHighStepNote(note)).length,
    longestRun: longestByDistance(groups.runs),
    longestWalk: longestByDistance(groups.walks),
    runElevationGainFt: sumNullable(groups.runs.map(activityElevationGain)),
    runElevationLossFt: sumNullable(groups.runs.map(activityElevationLoss)),
    walkElevationGainFt: sumNullable(groups.walks.map(activityElevationGain)),
    walkElevationLossFt: sumNullable(groups.walks.map(activityElevationLoss)),
    totalElevationGainFt: sumNullable(
      [...groups.runs, ...groups.walks].map(activityElevationGain),
    ),
    totalElevationLossFt: sumNullable(
      [...groups.runs, ...groups.walks].map(activityElevationLoss),
    ),
    averageRunPaceSecondsPerMile:
      runningMileage > 0 && runningDurationMinutes > 0
        ? (runningDurationMinutes * 60) / runningMileage
        : null,
    averageWalkPaceSecondsPerMile:
      walkingMileage > 0 && walkingDurationMinutes > 0
        ? (walkingDurationMinutes * 60) / walkingMileage
        : null,
    averageRunHr: weightedAverageHr(groups.runs),
    averageWalkHr: weightedAverageHr(groups.walks),
    totalCalories: sumNullable(
      activitiesForTotals.map((activity) => activity.calories ?? null),
    ),
    higherLoadActivities: higherLoadActivities([
      ...groups.runs,
      ...groups.walks,
      ...groups.tennis,
    ]),
    wellnessCoverageDays: dailyNotes.filter(hasGarminWellnessMetric).length,
    averageSleepDurationMinutes: averageNullable(
      dailyNotes.map((note) => note.sleepDurationMinutes ?? null),
    ),
    averageSleepScore: averageNullable(
      dailyNotes.map((note) => note.sleepScore ?? null),
    ),
    averageGarminStress: averageNullable(
      dailyNotes.map((note) => note.garminStress ?? null),
    ),
    averageRestingHeartRate: averageNullable(
      dailyNotes.map((note) => note.restingHeartRate ?? null),
    ),
    hrvStatusCoverageDays: dailyNotes.filter(
      (note) => note.overnightHrv != null || note.hrvStatus != null,
    ).length,
    bodyBatteryCoverageDays: dailyNotes.filter(
      (note) => note.bodyBattery != null,
    ).length,
  };
  const reconciliationWarnings = buildWeeklyReconciliationWarnings({
    evidenceStart,
    evidenceEnd,
    totals,
    dailyNotes,
    activityListByDay,
  });
  const dataAdjustments = buildWeeklyDataAdjustments({
    allDailyNotes: input.dailyNotes,
    canonicalDailyNotes: dailyNotes,
    activitiesForTotals,
  });

  return {
    weekStart: input.weekStart,
    weekEnd,
    evidenceStart,
    evidenceEnd,
    athleteConfig: input.athleteConfig,
    daysUntilRaceAtWeekEnd: daysUntilRace(
      parseDate(weekEnd),
      parseDate(input.athleteConfig.race.date),
    ),
    dailyNotes,
    activityNotes,
    manualActivities,
    planNotes: input.planNotes,
    journalEntries,
    exportWarnings: input.exportWarnings ?? [],
    duplicateWarnings: duplicateAnalysis.warnings,
    totals,
    recovery: {
      sorenessAverage: averageNullable(
        dailyNotes.map((note) => numericRecoveryValue(note.legSoreness)),
      ),
      sorenessHighest: maxNullable(
        dailyNotes.map((note) => numericRecoveryValue(note.legSoreness)),
      ),
      painReports: dailyNotes.filter(
        (note) =>
          (numericRecoveryValue(note.pain) !== null &&
            (numericRecoveryValue(note.pain) ?? 0) > 0) ||
          hasMeaningfulPainDetail(note.painLocation) ||
          hasMeaningfulPainDetail(note.painType),
      ),
      fatigueAverage: averageNullable(
        dailyNotes.map((note) => numericRecoveryValue(note.fatigue)),
      ),
      energyAverage: averageNullable(
        dailyNotes.map((note) => numericRecoveryValue(note.energy)),
      ),
      sleepAverage: averageNullable(
        dailyNotes.map((note) => numericRecoveryValue(note.sleepQuality)),
      ),
      stressAverage: averageNullable(
        dailyNotes.map((note) => numericRecoveryValue(note.stress)),
      ),
    },
    activityListByDay,
    travelBreakNote: buildTravelBreakNote(
      input.athleteConfig,
      input.weekStart,
      weekEnd,
    ),
    recoveryTrendFlags,
    safetyFlags: buildWeeklySafetyFlags(dailyNotes, activityNotes),
    missingDataFlags: buildWeeklyMissingDataFlags({
      dailyNotes,
      activityNotes,
      manualActivities,
      planNotes: input.planNotes,
      missingFiles: input.missingFiles ?? [],
      exportWarnings: input.exportWarnings ?? [],
      duplicateWarnings: duplicateAnalysis.warnings,
      journalEntries,
    }).concat(reconciliationWarnings),
    dataAdjustments,
  };
}

function enrichWeeklyRunWalkStructures(
  activities: ManualActivity[],
  activityNotes: ActivityNote[],
  dailyNotes: DailyNote[],
  journalEntries: JournalEntry[],
): ManualActivity[] {
  return activities.flatMap((activity) =>
    enrichRunWalkStructures({
      activities: [activity],
      activityNotes: activityNotes.filter(
        (note) => note.date === activity.date,
      ),
      dailyNoteText:
        dailyNotes.find((note) => note.date === activity.date)?.notes ?? null,
      journalEntry:
        journalEntries.find((entry) => entry.date === activity.date) ?? null,
    }),
  );
}

function canonicalDailyNotesByDate(notes: DailyNote[]): DailyNote[] {
  const byDate = new Map<string, DailyNote>();

  for (const note of notes) {
    const existing = byDate.get(note.date);

    if (!existing || stepSourcePriority(note) >= stepSourcePriority(existing)) {
      byDate.set(note.date, note);
    }
  }

  return [...byDate.values()];
}

function stepSourcePriority(note: DailyNote): number {
  switch (note.stepsSource) {
    case "journal_manual":
      return 4;
    case "garmin_daily_export":
    case "strava_daily_export":
      return 3;
    case "manual_csv":
      return 2;
    case "unknown":
      return 1;
    case null:
    case undefined:
      return 0;
    default:
      return 0;
  }
}

function buildActivityListByDay(
  weekStart: string,
  weekEnd: string,
  activities: ManualActivity[],
  dailyNotes: DailyNote[],
  journalEntries: JournalEntry[],
) {
  const days: Array<{
    date: string;
    activities: ManualActivity[];
    hasJournal: boolean;
    hasRecoveryNotes: boolean;
    confirmedRest: boolean;
    dayLoadClassification: WeeklySummary["activityListByDay"][number]["dayLoadClassification"];
  }> = [];
  let current = parseDate(weekStart);
  const end = parseDate(weekEnd);

  while (current.getTime() <= end.getTime()) {
    const date = formatDate(current);
    const dayActivities = activities.filter(
      (activity) => activity.date === date,
    );
    const dailyNote = dailyNotes.find((note) => note.date === date) ?? null;
    const journalEntry =
      journalEntries.find((entry) => entry.date === date) ?? null;

    days.push({
      date,
      activities: dayActivities,
      hasJournal: dailyNote !== null || journalEntry !== null,
      hasRecoveryNotes: dailyNote !== null,
      confirmedRest: isConfirmedRestDay(dayActivities, dailyNote, journalEntry),
      dayLoadClassification: classifyDayLoad({
        activities: dayActivities,
        dailyNote,
        journalEntry,
      }),
    });
    current = addDays(current, 1);
  }

  return days;
}

function isConfirmedRestDay(
  activities: ManualActivity[],
  dailyNote: DailyNote | null,
  journalEntry: JournalEntry | null,
): boolean {
  if (
    activities.some((activity) =>
      ["rest", "no_run", "no_activity"].includes(
        activity.activityType.trim().toLowerCase(),
      ),
    )
  ) {
    return true;
  }

  return hasExplicitRest(dailyNote, journalEntry);
}

function hasMeaningfulPainDetail(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return !["na", "n/a", "none", "no", "not applicable"].includes(
    value.trim().toLowerCase(),
  );
}

function buildWeeklySafetyFlags(
  dailyNotes: DailyNote[],
  activityNotes: ActivityNote[],
) {
  const flags: WeeklySummary["safetyFlags"] = [];

  for (const note of dailyNotes) {
    const pain = numericRecoveryValue(note.pain);

    if (pain !== null && pain >= 4) {
      flags.push({
        level: "concern",
        message: `${note.date}: pain is ${note.pain}/10, which meets the concern threshold.`,
      });
    }

    if (containsConcern(note.painType, ["sharp"])) {
      flags.push({
        level: "concern",
        message: `${note.date}: pain type includes sharp pain.`,
      });
    }

    if (containsConcern(note.painLocation, ["left", "right", "one-sided"])) {
      flags.push({
        level: "concern",
        message: `${note.date}: pain location may be one-sided.`,
      });
    }

    if (note.gaitChanged === true) {
      flags.push({
        level: "concern",
        message: `${note.date}: gait changed is marked true.`,
      });
    }
  }

  const painNotesByDate = new Map<string, string[]>();

  for (const note of activityNotes) {
    if (note.painNotes) {
      painNotesByDate.set(note.date, [
        ...(painNotesByDate.get(note.date) ?? []),
        note.painNotes,
      ]);
    }
  }

  for (const note of dailyNotes) {
    const text = [note.notes, ...(painNotesByDate.get(note.date) ?? [])]
      .filter((value): value is string => value !== null)
      .join(" ");

    if (containsConcern(text, ["worse", "worsening", "increasing"])) {
      flags.push({
        level: "concern",
        message: `${note.date}: notes suggest pain may be worsening.`,
      });
    }
  }

  return flags;
}

function buildWeeklyMissingDataFlags(input: {
  dailyNotes: DailyNote[];
  activityNotes: ActivityNote[];
  manualActivities: ManualActivity[];
  planNotes: string | null;
  missingFiles: string[];
  exportWarnings: Array<{ message: string }>;
  duplicateWarnings: Array<{ message: string; excludedFromTotals: boolean }>;
  journalEntries: JournalEntry[];
}) {
  const flags: WeeklySummary["missingDataFlags"] = [];
  const hasJournalEntries = input.journalEntries.length > 0;

  for (const missingFile of input.missingFiles) {
    const normalized = missingFile.replaceAll("\\", "/");

    if (normalized.includes("plan-notes.md")) {
      continue;
    }

    if (hasJournalEntries && isLegacyManualPath(normalized)) {
      continue;
    }

    flags.push({
      field: missingFile,
      message: `Missing local input file: ${missingFile}. Copy the matching template file before adding real data.`,
    });
  }

  if (input.dailyNotes.length === 0 && !hasJournalEntries) {
    flags.push({
      field: "daily-notes.csv",
      message: "No daily notes found for this week.",
    });
  }

  if (input.manualActivities.length === 0) {
    flags.push({
      field: "manual-activities.csv",
      message: "No manual activities found for this week.",
    });
  }

  if (input.activityNotes.length === 0 && !hasJournalEntries) {
    flags.push({
      field: "activity-notes.csv",
      message: "No activity notes found for this week.",
    });
  }

  return flags;
}

function buildWeeklyReconciliationWarnings(input: {
  evidenceStart: string;
  evidenceEnd: string;
  totals: WeeklySummary["totals"];
  dailyNotes: DailyNote[];
  activityListByDay: WeeklySummary["activityListByDay"];
}): WeeklySummary["missingDataFlags"] {
  const flags: WeeklySummary["missingDataFlags"] = [];
  const dayRunTotal = sumMileage(
    input.activityListByDay.flatMap((day) =>
      day.activities.filter(
        (activity) => activity.activityType.trim().toLowerCase() === "run",
      ),
    ),
  );
  const dayWalkTotal = sumMileage(
    input.activityListByDay.flatMap((day) =>
      day.activities.filter((activity) =>
        ["walk", "hike"].includes(activity.activityType.trim().toLowerCase()),
      ),
    ),
  );

  if (!approximatelyEqual(dayRunTotal, input.totals.runningMileage)) {
    flags.push({
      field: "weekly running mileage",
      message: `Weekly running mileage reconciliation warning: day details sum to ${formatMileageForWarning(dayRunTotal)} while the total is ${formatMileageForWarning(input.totals.runningMileage)}.`,
    });
  }

  if (!approximatelyEqual(dayWalkTotal, input.totals.walkingMileage)) {
    flags.push({
      field: "weekly walking mileage",
      message: `Weekly walking mileage reconciliation warning: day details sum to ${formatMileageForWarning(dayWalkTotal)} while the total is ${formatMileageForWarning(input.totals.walkingMileage)}.`,
    });
  }

  const missingStepDays =
    countDatesInRange(input.evidenceStart, input.evidenceEnd) -
    input.dailyNotes.filter((note) => stepApprox(note) !== null).length;

  if (missingStepDays > 0) {
    flags.push({
      field: "weekly steps",
      message: `Weekly step trend is based on ${input.totals.stepDaysWithData} of 7 evidence days.`,
    });
  }

  return flags;
}

function buildWeeklyDataAdjustments(input: {
  allDailyNotes: DailyNote[];
  canonicalDailyNotes: DailyNote[];
  activitiesForTotals: ManualActivity[];
}): string[] {
  const adjustments: string[] = [];
  const manualOverrideCount = input.activitiesForTotals.filter(
    (activity) =>
      activity.distanceSource === "manual_full_session" ||
      activity.durationSource === "manual_full_session",
  ).length;
  const journalStepOverrideDates = input.canonicalDailyNotes.filter((note) => {
    if (note.stepsSource !== "journal_manual" || stepApprox(note) === null) {
      return false;
    }

    return input.allDailyNotes.some(
      (candidate) =>
        candidate.date === note.date &&
        candidate !== note &&
        (candidate.stepsSource === "garmin_daily_export" ||
          candidate.stepsSource === "strava_daily_export") &&
        stepApprox(candidate) !== null,
    );
  }).length;

  if (manualOverrideCount > 0) {
    adjustments.push(
      `${formatCount(manualOverrideCount, "manual full-session correction")} ${manualOverrideCount === 1 ? "was" : "were"} applied to weekly mileage and longest-run calculations.`,
    );
  }

  if (journalStepOverrideDates > 0) {
    adjustments.push(
      `Manual journal steps overrode imported values on ${formatCount(journalStepOverrideDates, "date")}.`,
    );
  }

  return adjustments;
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.005;
}

function formatMileageForWarning(value: number): string {
  return `${Number(value.toFixed(2))} mi`;
}

function countDatesInRange(start: string, end: string): number {
  let count = 0;
  let current = parseDate(start);
  const endDate = parseDate(end);

  while (current.getTime() <= endDate.getTime()) {
    count += 1;
    current = addDays(current, 1);
  }

  return count;
}

function isLegacyManualPath(path: string): boolean {
  return (
    path.includes("input/manual/daily-notes.csv") ||
    path.includes("input/manual/activity-notes.csv") ||
    path.includes("input/manual/manual-activities.csv") ||
    path.includes("input/manual/plan-notes.md")
  );
}

function buildTravelBreakNote(
  config: AthleteConfig,
  weekStart: string,
  weekEnd: string,
): string | null {
  const travelBreak = config.background.travelNoRunningBreak;

  if (!travelBreak?.startDate || !travelBreak.endDate) {
    return null;
  }

  const start = parseDate(travelBreak.startDate);
  const end = parseDate(travelBreak.endDate);
  const weekStartDate = parseDate(weekStart);
  const weekEndDate = parseDate(weekEnd);
  const twoWeeksAfterWeekEnd = addDays(weekEndDate, 14);
  const overlaps = start <= weekEndDate && end >= weekStartDate;
  const approaching = start > weekEndDate && start <= twoWeeksAfterWeekEnd;

  if (!overlaps && !approaching) {
    return null;
  }

  const timing = overlaps ? "overlaps this week" : "is approaching";

  return `Configured travel/no-running break ${timing}: ${travelBreak.startDate} to ${travelBreak.endDate}. ${travelBreak.notes ?? "No extra notes provided."}`;
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);

  if (present.length === 0) {
    return null;
  }

  return present.reduce((total, value) => total + value, 0);
}

function averageNullable(values: Array<number | null>): number | null {
  const total = sumNullable(values);
  const count = values.filter(
    (value): value is number => value !== null,
  ).length;

  return total === null || count === 0 ? null : total / count;
}

function maxNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);

  return present.length === 0 ? null : Math.max(...present);
}

function longestByDistance(
  activities: ManualActivity[],
): ManualActivity | null {
  const withDistance = activities.filter(
    (activity) => activity.distanceMiles !== null,
  );

  if (withDistance.length === 0) {
    return null;
  }

  return withDistance.reduce((longest, activity) =>
    (activity.distanceMiles ?? 0) > (longest.distanceMiles ?? 0)
      ? activity
      : longest,
  );
}

function weightedAverageHr(activities: ManualActivity[]): number | null {
  const withHr = activities.filter(
    (activity) => activity.avgHr !== null && activity.durationMinutes !== null,
  );

  if (withHr.length === 0) {
    return null;
  }

  const weightedTotal = withHr.reduce(
    (total, activity) =>
      total + (activity.avgHr ?? 0) * (activity.durationMinutes ?? 0),
    0,
  );
  const durationTotal = withHr.reduce(
    (total, activity) => total + (activity.durationMinutes ?? 0),
    0,
  );

  return durationTotal === 0 ? null : weightedTotal / durationTotal;
}

function activityElevationGain(activity: ManualActivity): number | null {
  return activity.elevationGainFt ?? activity.elevationFt;
}

function activityElevationLoss(activity: ManualActivity): number | null {
  return activity.elevationLossFt ?? null;
}

function higherLoadActivities(activities: ManualActivity[]): ManualActivity[] {
  return activities.filter((activity) => {
    const distance = activity.distanceMiles ?? 0;
    const duration = activity.durationMinutes ?? 0;
    const calories = activity.calories ?? 0;

    return distance >= 4 || duration >= 60 || calories >= 500;
  });
}

function hasGarminWellnessMetric(note: DailyNote): boolean {
  return (
    note.sleepDurationMinutes != null ||
    note.sleepScore != null ||
    note.restingHeartRate != null ||
    note.overnightHrv != null ||
    note.hrvStatus != null ||
    note.garminStress != null ||
    note.bodyBattery != null
  );
}

function containsConcern(value: string | null, terms: string[]): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();

  return terms.some((term) => normalized.includes(term));
}

function hasValue(value: string | null): boolean {
  return value !== null && value.trim() !== "" && value.trim() !== "none";
}
