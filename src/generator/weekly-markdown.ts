import type { ManualActivity, WeeklySummary } from "../types";
import { formatUnknown } from "../utils/format";
import { formatPace } from "../utils/pace";

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
    `- Rock climbing sessions: ${summary.totals.rockClimbingCount}`,
    `- Weights/strength sessions: ${summary.totals.weightsCount}`,
    `- Tennis sessions: ${summary.totals.tennisCount}`,
    `- Mobility/rest/other activity count: ${summary.totals.mobilityRestOtherCount}`,
    `- Rest days: ${countRestDays(summary)}`,
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
    `- Fatigue average: ${formatRounded(summary.recovery.fatigueAverage, "unknown")}`,
    `- Energy average: ${formatRounded(summary.recovery.energyAverage, "unknown")}`,
    `- Sleep average: ${formatRounded(summary.recovery.sleepAverage, "unknown")}`,
    `- Stress average: ${formatRounded(summary.recovery.stressAverage, "unknown")}`,
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
  return `${Number(minutes.toFixed(1))} min`;
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
    activity.distanceMiles === null ? null : `${activity.distanceMiles} mi`,
    activity.durationMinutes === null
      ? null
      : `${activity.durationMinutes} min`,
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
    return "not provided";
  }

  return summary.recovery.painReports
    .map(
      (note) =>
        `${note.date}: pain ${formatUnknown(note.pain, "unknown")}/10, ${formatUnknown(note.painLocation, "unknown")} ${formatUnknown(note.painType, "unknown")}`,
    )
    .join("; ");
}

function formatActivityListByDay(summary: WeeklySummary): string {
  return summary.activityListByDay
    .map((day) => {
      if (day.activities.length === 0) {
        return `- ${day.date}: not provided`;
      }

      return `- ${day.date}: ${day.activities.map(formatActivity).join("; ")}`;
    })
    .join("\n");
}

function formatActivity(activity: ManualActivity): string {
  return [
    activity.activityType,
    activity.distanceMiles === null ? null : `${activity.distanceMiles} mi`,
    activity.durationMinutes === null
      ? null
      : `${activity.durationMinutes} min`,
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

function countRestDays(summary: WeeklySummary): number {
  return summary.activityListByDay.filter((day) => day.activities.length === 0)
    .length;
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
    .map((note) => `${note.date}: ${note.motivation}/10`);

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
          : `${Number(activity.durationMinutes.toFixed(1))} min`,
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
