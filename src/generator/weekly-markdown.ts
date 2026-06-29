import type {
  DailyNote,
  ManualActivity,
  RecoveryValue,
  WeeklySummary,
} from "../types";
import { formatUnknown } from "../utils/format";
import { formatPace } from "../utils/pace";
import { formatRecoveryValue, numericRecoveryValue } from "../utils/recovery";
import { secondsToReadableDuration } from "../utils/units";

export function renderWeeklySummary(summary: WeeklySummary): string {
  const config = summary.athleteConfig;

  return [
    "# Weekly Marathon Coach Check-In",
    "",
    "## Dates",
    "",
    `- Week start: ${summary.weekStart}`,
    `- Week end: ${summary.weekEnd}`,
    `- Evidence window: ${summary.evidenceStart} to ${summary.evidenceEnd}`,
    `- Race: ${config.race.name}`,
    `- Race date: ${config.race.date}`,
    `- Race goal: ${config.race.goalTime}`,
    `- Days until race: ${summary.daysUntilRaceAtWeekEnd}`,
    "",
    "## Recent Training Summary",
    "",
    `- Running days: ${summary.totals.runCount}`,
    `- Running mileage: ${formatMiles(summary.totals.runningMileage)}`,
    `- Longest run: ${formatActivityDistance(summary.totals.longestRun)}`,
    `- Walking mileage: ${formatMiles(summary.totals.walkingMileage)}`,
    `- Step load: total ${formatUnknown(summary.totals.totalSteps, "unknown")}; average ${formatRounded(summary.totals.averageDailySteps, "unknown")}`,
    `- High-step days: ${summary.totals.highStepDays}; step trend: ${formatStepTrend(summary)}`,
    `- Rock climbing sessions: ${summary.totals.rockClimbingCount}`,
    `- Weights/strength sessions: ${summary.totals.weightsCount}`,
    `- Tennis sessions: ${summary.totals.tennisCount}`,
    `- Mobility/rest/other activity count: ${summary.totals.mobilityRestOtherCount}`,
    `- Confirmed rest/no-run days: ${countConfirmedRestDays(summary)}`,
    `- Days with no activity data found: ${countMissingActivityDays(summary)}`,
    "",
    "## Activity Details",
    "",
    formatActivityListByDay(summary),
    "",
    "## Recovery Trend",
    "",
    `- Soreness average: ${formatRounded(summary.recovery.sorenessAverage, "unknown")}`,
    `- Soreness highest: ${formatUnknown(summary.recovery.sorenessHighest, "unknown")}`,
    `- Pain reports: ${formatPainReports(summary)}`,
    `- Gait-change flags: ${formatGaitFlags(summary)}`,
    `- ${formatRecoveryMetric(summary, "Fatigue", "fatigue")}`,
    `- ${formatRecoveryMetric(summary, "Energy", "energy")}`,
    `- ${formatRecoveryMetric(summary, "Sleep", "sleepQuality")}`,
    `- ${formatRecoveryMetric(summary, "Stress", "stress")}`,
    `- Motivation notes: ${formatMotivation(summary)}`,
    "",
    "## Load / Risk Flags",
    "",
    ...formatLoadRiskFlags(summary),
    "",
    "## Upcoming Constraints",
    "",
    ...formatUpcomingConstraints(summary),
    "",
    "## Current Plan Context",
    "",
    `- Experience: ${formatUnknown(config.background.experienceLevel)}`,
    `- Marathon: ${config.race.name} on ${config.race.date}; goal ${config.race.goalTime}.`,
    "- Injury prevention and consistency should be prioritized over aggressive mileage jumps.",
    "- Running mileage, walking mileage, steps, and cross-training load should stay separate.",
    `- Recurring cross-training: ${formatCrossTraining(config)}`,
    `- Travel/no-running break: ${formatUnknown(summary.travelBreakNote, "not overlapping or approaching the planning week")}`,
    "",
    "## Data Quality Notes",
    "",
    "- Walking mileage is reported separately and is not counted as running mileage.",
    "- Rock climbing, tennis, weights, mobility, and steps are training-load context, not running mileage.",
    "- Do not claim marathon goal readiness from this week alone; treat ambitious race goals as stretch goals unless supported by enough recent data.",
    "- Missing values are shown as unknown or not provided.",
    "- Local export parsing omits route points and GPS coordinates from this prompt.",
    ...formatExportWarnings(summary.exportWarnings),
    ...formatDuplicateWarnings(summary.duplicateWarnings),
    "",
    "## Missing Data Flags",
    "",
    formatFlags(summary.missingDataFlags.map((flag) => flag.message)),
    "",
    "## Safety Flags",
    "",
    summary.safetyFlags.length === 0
      ? "- No concern flags from the provided notes. Do not diagnose; use this only as training context."
      : formatFlags(
          summary.safetyFlags.map(
            (flag) => `${flag.message} Do not diagnose; prioritize caution.`,
          ),
        ),
    "",
    "## Question For ChatGPT Coach",
    "",
    "Given this weekly context, how should I structure the upcoming week? Prioritize injury prevention, consistency, and separating running mileage from walking and cross-training load. Please adjust for recovery, missed training, climbing/tennis/weights load, and upcoming constraints.",
    "",
  ].join("\n");
}

function formatBaselineRun(config: WeeklySummary["athleteConfig"]): string {
  const baseline = config.background.baselineRun;

  if (!baseline) {
    return "not provided";
  }

  return [
    baseline.date,
    baseline.distanceMiles === undefined
      ? null
      : `${baseline.distanceMiles} mi`,
    baseline.durationMinutes === undefined
      ? null
      : `${baseline.durationMinutes} min`,
    baseline.notes,
  ]
    .filter((value): value is string => value !== null && value !== undefined)
    .join(", ");
}

function formatStepTrend(summary: WeeklySummary): string {
  const days = summary.totals.stepDaysWithData;

  if (days === 0) {
    return "unknown";
  }

  if (days < 7) {
    return `limited because steps were provided for ${days} of 7 evidence days`;
  }

  return "available for all 7 evidence days";
}

function formatLifestyleActivity(
  config: WeeklySummary["athleteConfig"],
): string {
  const lifestyle = config.normalLifestyleActivity;

  if (!lifestyle) {
    return "not provided";
  }

  return `${formatUnknown(lifestyle.averageDailySteps, "unknown")} average daily steps; ${formatUnknown(lifestyle.notes, "not provided")}`;
}

function formatCrossTraining(config: WeeklySummary["athleteConfig"]): string {
  if (
    !config.recurringCrossTraining ||
    config.recurringCrossTraining.length === 0
  ) {
    return "not provided";
  }

  return config.recurringCrossTraining
    .map(
      (item) =>
        `${item.activityType} ${item.frequency}${item.notes ? ` (${item.notes})` : ""}`,
    )
    .join("; ");
}

function formatMiles(miles: number): string {
  return `${Number(miles.toFixed(2))} mi`;
}

function formatMinutes(minutes: number): string {
  return secondsToReadableDuration(minutes * 60);
}

function formatRounded(value: number | null, fallback: string): string {
  return value === null ? fallback : String(Number(value.toFixed(1)));
}

function formatActivityDistance(activity: ManualActivity | null): string {
  if (!activity) {
    return "not provided";
  }

  return [
    activity.date,
    activity.activityType,
    activity.distanceMiles === null
      ? null
      : formatMiles(activity.distanceMiles),
    activity.durationMinutes === null
      ? null
      : formatMinutes(activity.durationMinutes),
    activity.avgHr === null ? null : `Avg HR ${activity.avgHr}`,
    activity.calories === null || activity.calories === undefined
      ? null
      : `${Math.round(activity.calories)} calories`,
    activity.notes,
  ]
    .filter((value): value is string => value !== null)
    .join(", ");
}

function formatPainReports(summary: WeeklySummary): string {
  if (summary.recovery.painReports.length === 0) {
    return "none reported.";
  }

  return summary.recovery.painReports
    .map((note) => `${note.date}: ${formatPainReport(note)}`)
    .join("; ");
}

function formatPainReport(note: DailyNote): string {
  const pain = numericRecoveryValue(note.pain);
  const details = [
    cleanPainDetail(note.painLocation),
    cleanPainDetail(note.painType),
  ]
    .filter((value): value is string => value !== null)
    .join(", ");

  if (pain !== null) {
    const painText = `${pain}/10`;

    return details === ""
      ? `pain ${painText}; location/type not provided.`
      : `${details}, ${painText}.`;
  }

  return details === ""
    ? `pain ${formatRecoveryValue(note.pain, "unknown")}.`
    : `${details}, pain ${formatRecoveryValue(note.pain, "unknown")}.`;
}

function cleanPainDetail(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return ["na", "n/a", "none", "no", "not applicable"].includes(normalized)
    ? null
    : value;
}

function formatRecoveryMetric(
  summary: WeeklySummary,
  label: string,
  key: "fatigue" | "energy" | "sleepQuality" | "stress",
): string {
  const values = summary.dailyNotes
    .map((note) => note[key])
    .filter((value): value is RecoveryValue => value !== null);
  const numericValues = values
    .map((value) => numericRecoveryValue(value))
    .filter((value): value is number => value !== null);
  const textValues = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  if (numericValues.length > 0) {
    const average =
      numericValues.reduce((total, value) => total + value, 0) /
      numericValues.length;

    return `${label} average: ${formatRounded(average, "unknown")}`;
  }

  if (textValues.length > 0) {
    return `${label} notes: ${[...new Set(textValues)].slice(0, 3).join("; ")}`;
  }

  return `${label} average: unknown`;
}

function formatActivityListByDay(summary: WeeklySummary): string {
  return summary.activityListByDay
    .map((day) => {
      if (day.activities.length === 0) {
        if (day.confirmedRest) {
          return `- ${day.date}: confirmed no-run/rest day`;
        }

        if (day.hasRecoveryNotes || day.hasJournal) {
          return `- ${day.date}: recovery notes only; no imported or manual activities`;
        }

        return `- ${day.date}: no activity data found`;
      }

      return `- ${day.date}: ${day.activities.map(formatActivity).join("; ")}`;
    })
    .join("\n");
}

function formatActivity(activity: ManualActivity): string {
  return [
    activity.activityType,
    activity.distanceMiles === null
      ? null
      : formatMiles(activity.distanceMiles),
    activity.durationMinutes === null
      ? null
      : formatMinutes(activity.durationMinutes),
    activity.avgHr === null ? null : `Avg HR ${activity.avgHr}`,
    activity.elevationGainFt === null || activity.elevationGainFt === undefined
      ? null
      : `Elevation gain ${Math.round(activity.elevationGainFt)} ft`,
    activity.elevationLossFt === null || activity.elevationLossFt === undefined
      ? null
      : `Elevation loss ${Math.round(activity.elevationLossFt)} ft`,
    `source ${activity.source}`,
    "route details omitted",
  ]
    .filter((value): value is string => value !== null)
    .join(", ");
}

function countConfirmedRestDays(summary: WeeklySummary): number {
  return summary.activityListByDay.filter((day) => day.confirmedRest).length;
}

function countMissingActivityDays(summary: WeeklySummary): number {
  return summary.activityListByDay.filter(
    (day) =>
      day.activities.length === 0 &&
      !day.confirmedRest &&
      !day.hasJournal &&
      !day.hasRecoveryNotes,
  ).length;
}

function formatGaitFlags(summary: WeeklySummary): string {
  const flags = summary.dailyNotes
    .filter((note) => note.gaitChanged === true)
    .map((note) => note.date);

  return flags.length === 0 ? "none reported" : flags.join(", ");
}

function formatMotivation(summary: WeeklySummary): string {
  const values = summary.dailyNotes
    .filter((note) => note.motivation !== null)
    .map((note) =>
      typeof note.motivation === "number"
        ? `${note.date}: ${note.motivation}/10`
        : `${note.date}: ${note.motivation}`,
    );

  return values.length === 0 ? "unknown" : values.join("; ");
}

function formatLoadRiskFlags(summary: WeeklySummary): string[] {
  const flags = [
    ...summary.safetyFlags.map(
      (flag) => `${flag.message} Do not diagnose; prioritize caution.`,
    ),
  ];

  if (summary.totals.higherLoadActivities.length > 0) {
    flags.push(
      `Higher-load activities: ${formatHigherLoadActivities(summary.totals.higherLoadActivities)}.`,
    );
  }

  for (const day of summary.activityListByDay) {
    const types = day.activities.map((activity) => activity.activityType);
    if (
      types.includes("run") &&
      types.some((type) =>
        ["rock_climbing", "tennis", "weights", "strength"].includes(type),
      )
    ) {
      flags.push(`${day.date}: running plus cross-training load on same day.`);
    }
  }

  if (
    summary.totals.averageDailySteps !== null &&
    summary.totals.averageDailySteps >= 12000
  ) {
    flags.push("Average daily steps were high enough to matter for recovery.");
  }

  if (summary.missingDataFlags.length > 0) {
    flags.push("Recovery or activity trend may be limited by missing data.");
  }

  return flags.length === 0
    ? ["- No major load/risk flags from provided notes."]
    : flags.map((flag) => `- ${flag}`);
}

function formatUpcomingConstraints(summary: WeeklySummary): string[] {
  const constraints = [
    summary.travelBreakNote,
    summary.planNotes === null ? null : `Plan notes: ${summary.planNotes}`,
    ...summary.journalEntries
      .map((entry) => entry.coachNotes)
      .filter((note): note is string => note !== null)
      .filter((note) => hasConstraintLanguage(note))
      .map((note) => `Recent journal constraint note: ${note}`),
  ].filter((value): value is string => value !== null);

  return constraints.length === 0
    ? ["- No upcoming constraints found in journals, plan notes, or config."]
    : constraints.map((constraint) => `- ${constraint}`);
}

function hasConstraintLanguage(value: string): boolean {
  const normalized = value.toLowerCase();

  return [
    "travel",
    "trip",
    "no-running",
    "no running",
    "constraint",
    "busy",
    "work",
    "school",
    "amusement",
    "park",
    "race",
    "event",
    "climb",
  ].some((term) => normalized.includes(term));
}

function formatHigherLoadActivities(activities: ManualActivity[]): string {
  if (activities.length === 0) {
    return "not provided";
  }

  return activities
    .map((activity) =>
      [
        activity.date,
        activity.activityType,
        activity.distanceMiles === null
          ? null
          : `${Number(activity.distanceMiles.toFixed(2))} mi`,
        activity.durationMinutes === null
          ? null
          : formatMinutes(activity.durationMinutes),
        activity.avgHr === null ? null : `Avg HR ${activity.avgHr}`,
        activity.calories === null || activity.calories === undefined
          ? null
          : `${Math.round(activity.calories)} calories`,
      ]
        .filter((value): value is string => value !== null)
        .join(", "),
    )
    .join("; ");
}

function formatFlags(flags: string[]): string {
  if (flags.length === 0) {
    return "- None.";
  }

  return flags.map((flag) => `- ${flag}`).join("\n");
}

function formatExportWarnings(warnings: Array<{ message: string }>): string[] {
  if (warnings.length === 0) {
    return ["- No local export warnings."];
  }

  return warnings.map((warning) => `- ${warning.message}`);
}

function formatDuplicateWarnings(
  warnings: Array<{ message: string; excludedFromTotals: boolean }>,
): string[] {
  if (warnings.length === 0) {
    return ["- No likely duplicate activity warnings."];
  }

  return warnings.map((warning) => `- ${warning.message}`);
}
