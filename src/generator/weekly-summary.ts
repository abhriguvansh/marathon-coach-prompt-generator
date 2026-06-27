import type {
  ActivityNote,
  AthleteConfig,
  DailyNote,
  ExportParseWarning,
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
import {
  classifyActivities,
  sumDurationMinutes,
  sumMileage,
} from "./activity-classification";
import { analyzeActivityDuplicates } from "./duplicate-detection";

export function createWeeklySummary(input: {
  weekStart: string;
  athleteConfig: AthleteConfig;
  dailyNotes: DailyNote[];
  activityNotes: ActivityNote[];
  manualActivities: ManualActivity[];
  planNotes: string | null;
  missingFiles?: string[];
  exportWarnings?: ExportParseWarning[];
}): WeeklySummary {
  const weekEnd = formatDate(addDays(parseDate(input.weekStart), 6));
  const dailyNotes = input.dailyNotes.filter((note) =>
    isDateWithinRange(note.date, input.weekStart, weekEnd),
  );
  const activityNotes = input.activityNotes.filter((note) =>
    isDateWithinRange(note.date, input.weekStart, weekEnd),
  );
  const manualActivities = input.manualActivities.filter((activity) =>
    isDateWithinRange(activity.date, input.weekStart, weekEnd),
  );
  const duplicateAnalysis = analyzeActivityDuplicates(manualActivities);
  const activitiesForTotals = duplicateAnalysis.activitiesForTotals;
  const groups = classifyActivities(activitiesForTotals);
  const runningMileage = sumMileage(groups.runs);
  const walkingMileage = sumMileage(groups.walks);
  const runningDurationMinutes = sumDurationMinutes(groups.runs);
  const walkingDurationMinutes = sumDurationMinutes(groups.walks);

  return {
    weekStart: input.weekStart,
    weekEnd,
    athleteConfig: input.athleteConfig,
    daysUntilRaceAtWeekEnd: daysUntilRace(
      parseDate(weekEnd),
      parseDate(input.athleteConfig.race.date),
    ),
    dailyNotes,
    activityNotes,
    manualActivities,
    planNotes: input.planNotes,
    exportWarnings: input.exportWarnings ?? [],
    duplicateWarnings: duplicateAnalysis.warnings,
    totals: {
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
      mobilityRestOtherCount:
        groups.mobility.length + groups.restOrOther.length,
      totalSteps: sumNullable(dailyNotes.map((note) => note.totalSteps)),
      averageDailySteps: averageNullable(
        dailyNotes.map((note) => note.totalSteps),
      ),
      longestRun: longestByDistance(groups.runs),
      longestWalk: longestByDistance(groups.walks),
      runElevationGainFt: sumNullable(
        groups.runs.map((activity) => activity.elevationFt),
      ),
      averageRunPaceSecondsPerMile:
        runningMileage > 0 && runningDurationMinutes > 0
          ? (runningDurationMinutes * 60) / runningMileage
          : null,
      averageRunHr: weightedAverageHr(groups.runs),
    },
    recovery: {
      sorenessAverage: averageNullable(
        dailyNotes.map((note) => note.legSoreness),
      ),
      sorenessHighest: maxNullable(dailyNotes.map((note) => note.legSoreness)),
      painReports: dailyNotes.filter(
        (note) =>
          (note.pain !== null && note.pain > 0) ||
          hasValue(note.painLocation) ||
          hasValue(note.painType),
      ),
      fatigueAverage: averageNullable(dailyNotes.map((note) => note.fatigue)),
      energyAverage: averageNullable(dailyNotes.map((note) => note.energy)),
      sleepAverage: averageNullable(
        dailyNotes.map((note) => note.sleepQuality),
      ),
      stressAverage: averageNullable(dailyNotes.map((note) => note.stress)),
    },
    activityListByDay: buildActivityListByDay(
      input.weekStart,
      weekEnd,
      manualActivities,
    ),
    travelBreakNote: buildTravelBreakNote(
      input.athleteConfig,
      input.weekStart,
      weekEnd,
    ),
    safetyFlags: buildWeeklySafetyFlags(dailyNotes, activityNotes),
    missingDataFlags: buildWeeklyMissingDataFlags({
      dailyNotes,
      activityNotes,
      manualActivities,
      planNotes: input.planNotes,
      missingFiles: input.missingFiles ?? [],
      exportWarnings: input.exportWarnings ?? [],
      duplicateWarnings: duplicateAnalysis.warnings,
    }),
  };
}

function buildActivityListByDay(
  weekStart: string,
  weekEnd: string,
  activities: ManualActivity[],
) {
  const days: Array<{ date: string; activities: ManualActivity[] }> = [];
  let current = parseDate(weekStart);
  const end = parseDate(weekEnd);

  while (current.getTime() <= end.getTime()) {
    const date = formatDate(current);
    days.push({
      date,
      activities: activities.filter((activity) => activity.date === date),
    });
    current = addDays(current, 1);
  }

  return days;
}

function buildWeeklySafetyFlags(
  dailyNotes: DailyNote[],
  activityNotes: ActivityNote[],
) {
  const flags: WeeklySummary["safetyFlags"] = [];

  for (const note of dailyNotes) {
    if (note.pain !== null && note.pain >= 4) {
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
}) {
  const flags: WeeklySummary["missingDataFlags"] = [];

  for (const missingFile of input.missingFiles) {
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

  if (input.dailyNotes.length === 0) {
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

  if (input.activityNotes.length === 0) {
    flags.push({
      field: "activity-notes.csv",
      message: "No activity notes found for this week.",
    });
  }

  if (!input.planNotes) {
    flags.push({
      field: "plan-notes.md",
      message: "Plan notes were not provided.",
    });
  }

  return flags;
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
