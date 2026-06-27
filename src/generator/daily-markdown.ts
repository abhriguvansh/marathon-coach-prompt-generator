import type { ActivityNote, DailySummary, ManualActivity } from "../types";
import { formatUnknown } from "../utils/format";

export function renderDailyCheckIn(summary: DailySummary): string {
  const config = summary.athleteConfig;
  const daily = summary.dailyNote;

  return [
    "# Daily Marathon Coach Check-In",
    "",
    `- Date: ${summary.date}`,
    `- Evidence date: ${summary.evidenceDate}`,
    `- Days until race: ${summary.daysUntilRace}`,
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
    `- Travel/no-running break: ${formatTravelBreak(config)}`,
    `- Normal lifestyle activity: ${formatLifestyleActivity(config)}`,
    `- Recurring cross-training: ${formatCrossTraining(config)}`,
    "",
    "## Yesterday's Logged Activities",
    "",
    `- Runs: ${formatActivities(summary.runs)}`,
    `- Walks: ${formatActivities(summary.walks)}`,
    `- Rock climbing: ${formatActivities(summary.rockClimbing)}`,
    `- Tennis: ${formatActivities(summary.tennis)}`,
    `- Weights/strength: ${formatActivities(summary.weights)}`,
    `- Mobility: ${formatActivities(summary.mobility)}`,
    `- Rest/other activity: ${formatActivities(summary.restOrOther)}`,
    "",
    "## Mileage And Load",
    "",
    `- Running mileage: ${formatMiles(summary.runningMileage)}`,
    `- Walking mileage: ${formatMiles(summary.walkingMileage)}`,
    `- Steps: ${formatUnknown(daily?.totalSteps, "unknown")}`,
    "",
    "## Recovery Notes",
    "",
    `- Soreness: ${formatUnknown(daily?.legSoreness, "unknown")}`,
    `- Pain: ${formatUnknown(daily?.pain, "unknown")}`,
    `- Pain location/type: ${formatUnknown(daily?.painLocation, "unknown")} / ${formatUnknown(daily?.painType, "unknown")}`,
    `- Gait changed: ${formatUnknown(daily?.gaitChanged, "unknown")}`,
    `- Fatigue: ${formatUnknown(daily?.fatigue, "unknown")}`,
    `- Energy: ${formatUnknown(daily?.energy, "unknown")}`,
    `- Sleep: ${formatUnknown(daily?.sleepQuality, "unknown")}`,
    `- Stress: ${formatUnknown(daily?.stress, "unknown")}`,
    `- Motivation: ${formatUnknown(daily?.motivation, "unknown")}`,
    `- Daily notes: ${formatUnknown(daily?.notes, "not provided")}`,
    "",
    "## Gear And Fueling",
    "",
    `- Gear notes: ${formatActivityNoteValues(summary.activityNotes, "gear")}`,
    `- Fueling/hydration notes: ${formatActivityNoteValues(summary.activityNotes, "fuelingHydrationNotes")}`,
    "",
    "## Plan Notes",
    "",
    formatUnknown(summary.planNotes, "not provided"),
    "",
    "## Missing Data Flags",
    "",
    formatFlags(summary.missingDataFlags.map((flag) => flag.message)),
    "",
    "## Data Quality Notes",
    "",
    "- Walking mileage is reported separately and is not counted as running mileage.",
    "- Local export parsing omits route points and GPS coordinates from this prompt.",
    ...formatExportWarnings(summary.exportWarnings),
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
    "Given this context, what should I do today, and should this week's plan change? Prioritize injury prevention, consistency, and separating running mileage from walking and cross-training load.",
    "",
  ].join("\n");
}

function formatBaselineRun(config: DailySummary["athleteConfig"]): string {
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

function formatTravelBreak(config: DailySummary["athleteConfig"]): string {
  const travelBreak = config.background.travelNoRunningBreak;

  if (!travelBreak) {
    return "not provided";
  }

  return `${formatUnknown(travelBreak.startDate, "unknown")} to ${formatUnknown(
    travelBreak.endDate,
    "unknown",
  )}: ${formatUnknown(travelBreak.notes, "not provided")}`;
}

function formatLifestyleActivity(
  config: DailySummary["athleteConfig"],
): string {
  const lifestyle = config.normalLifestyleActivity;

  if (!lifestyle) {
    return "not provided";
  }

  return `${formatUnknown(lifestyle.averageDailySteps, "unknown")} average daily steps; ${formatUnknown(lifestyle.notes, "not provided")}`;
}

function formatCrossTraining(config: DailySummary["athleteConfig"]): string {
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

function formatActivities(activities: ManualActivity[]): string {
  if (activities.length === 0) {
    return "not provided";
  }

  return activities
    .map((activity) =>
      [
        activity.activityType,
        activity.distanceMiles === null ? null : `${activity.distanceMiles} mi`,
        activity.durationMinutes === null
          ? null
          : `${activity.durationMinutes} min`,
        activity.paceMinPerMile === null
          ? null
          : `${activity.paceMinPerMile} min/mi`,
        activity.notes,
      ]
        .filter((value): value is string => value !== null)
        .join(", "),
    )
    .join("; ");
}

function formatMiles(miles: number): string {
  return `${Number(miles.toFixed(2))} mi`;
}

function formatActivityNoteValues(
  activityNotes: ActivityNote[],
  key: "gear" | "fuelingHydrationNotes",
): string {
  const values = activityNotes
    .map((note) => note[key])
    .filter((value): value is string => value !== null);

  return values.length === 0 ? "not provided" : values.join("; ");
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
