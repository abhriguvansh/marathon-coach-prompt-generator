import type { ManualActivity, WeeklySummary } from "../types";
import { formatUnknown } from "../utils/format";
import { formatPace } from "../utils/pace";

export function renderWeeklySummary(summary: WeeklySummary): string {
  const config = summary.athleteConfig;

  return [
    "# Weekly Marathon Training Summary",
    "",
    `- Week: ${summary.weekStart} to ${summary.weekEnd}`,
    `- Days until race at week end: ${summary.daysUntilRaceAtWeekEnd}`,
    `- Race: ${config.race.name}`,
    `- Race date: ${config.race.date}`,
    `- Race goal: ${config.race.goalTime}`,
    `- Goal pace: ${config.race.goalPace}`,
    "",
    "## Athlete Background",
    "",
    `- Athlete: ${formatUnknown(config.athleteName)}`,
    `- Experience: ${formatUnknown(config.background.experienceLevel)}`,
    `- Running background: ${formatUnknown(config.background.runningBackground, "not provided")}`,
    `- Baseline run: ${formatBaselineRun(config)}`,
    `- Travel/no-running break: ${formatUnknown(summary.travelBreakNote, "not overlapping or approaching this week")}`,
    `- Normal lifestyle activity: ${formatLifestyleActivity(config)}`,
    `- Recurring cross-training: ${formatCrossTraining(config)}`,
    "",
    "## Weekly Totals",
    "",
    `- Running mileage: ${formatMiles(summary.totals.runningMileage)}`,
    `- Walking mileage: ${formatMiles(summary.totals.walkingMileage)}`,
    `- Total active mileage: ${formatMiles(summary.totals.totalActiveMileage)}`,
    `- Running duration: ${formatMinutes(summary.totals.runningDurationMinutes)}`,
    `- Walking duration: ${formatMinutes(summary.totals.walkingDurationMinutes)}`,
    `- Number of runs: ${summary.totals.runCount}`,
    `- Number of walks: ${summary.totals.walkCount}`,
    `- Rock climbing sessions: ${summary.totals.rockClimbingCount}`,
    `- Tennis sessions: ${summary.totals.tennisCount}`,
    `- Weights/strength sessions: ${summary.totals.weightsCount}`,
    `- Mobility/rest/other activity count: ${summary.totals.mobilityRestOtherCount}`,
    `- Total steps: ${formatUnknown(summary.totals.totalSteps, "unknown")}`,
    `- Average daily steps: ${formatRounded(summary.totals.averageDailySteps, "unknown")}`,
    `- Longest run: ${formatActivityDistance(summary.totals.longestRun)}`,
    `- Longest walk: ${formatActivityDistance(summary.totals.longestWalk)}`,
    `- Elevation gain from runs: ${formatRounded(summary.totals.runElevationGainFt, "unknown")} ft`,
    `- Elevation gain from walks: ${formatRounded(summary.totals.walkElevationGainFt, "unknown")} ft`,
    `- Total run/walk elevation gain: ${formatRounded(summary.totals.totalElevationGainFt, "unknown")} ft`,
    `- Average run pace: ${formatPace(summary.totals.averageRunPaceSecondsPerMile)}`,
    `- Average walk pace: ${formatPace(summary.totals.averageWalkPaceSecondsPerMile)}`,
    `- Average run HR: ${formatRounded(summary.totals.averageRunHr, "unknown")}`,
    `- Average walk HR: ${formatRounded(summary.totals.averageWalkHr, "unknown")}`,
    `- Parsed activity calories: ${formatRounded(summary.totals.totalCalories, "unknown")}`,
    `- Higher load days: ${formatHigherLoadActivities(summary.totals.higherLoadActivities)}`,
    "",
    "## Recovery Trend",
    "",
    `- Soreness average: ${formatRounded(summary.recovery.sorenessAverage, "unknown")}`,
    `- Soreness highest: ${formatUnknown(summary.recovery.sorenessHighest, "unknown")}`,
    `- Pain reports: ${formatPainReports(summary)}`,
    `- Fatigue average: ${formatRounded(summary.recovery.fatigueAverage, "unknown")}`,
    `- Energy average: ${formatRounded(summary.recovery.energyAverage, "unknown")}`,
    `- Sleep average: ${formatRounded(summary.recovery.sleepAverage, "unknown")}`,
    `- Stress average: ${formatRounded(summary.recovery.stressAverage, "unknown")}`,
    "",
    "## Activity List By Day",
    "",
    formatActivityListByDay(summary),
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
    "## Plan Notes",
    "",
    formatUnknown(summary.planNotes, "not provided"),
    "",
    "## Question For ChatGPT Coach",
    "",
    "Please review this week, recommend next week's structure, and identify whether training should progress, hold steady, or back off. Prioritize injury prevention, consistency, and keeping running mileage separate from walking and cross-training load.",
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
    activity.notes,
  ]
    .filter((value): value is string => value !== null)
    .join(", ");
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
