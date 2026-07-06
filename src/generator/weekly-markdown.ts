import type {
  DailyNote,
  ManualActivity,
  RecoveryValue,
  WeeklySummary,
} from "../types";
import { formatUnknown } from "../utils/format";
import { formatPace } from "../utils/pace";
import { formatRecoveryValue, numericRecoveryValue } from "../utils/recovery";
import { formatRunWalkRatio } from "../utils/run-walk";
import { secondsToReadableDuration } from "../utils/units";

export function renderWeeklySummary(
  summary: WeeklySummary,
  options: { includeContext?: boolean } = {},
): string {
  const config = summary.athleteConfig;
  const sections: string[] = [];

  sections.push(
    renderSection(null, [
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
    ]),
  );
  sections.push(
    renderSection("Recent Training Summary", [
      `- Running sessions: ${summary.totals.runCount}`,
      `- Running days: ${countActivityDays(summary, "run")}`,
      `- Running mileage: ${formatMiles(summary.totals.runningMileage)}`,
      `- Longest run: ${formatActivityDistance(summary.totals.longestRun)}`,
      `- Walking mileage: ${formatMiles(summary.totals.walkingMileage)}`,
      `- Step load: total ${formatUnknown(summary.totals.totalSteps, "unknown")}; average ${formatRounded(summary.totals.averageDailySteps, "unknown")}`,
      `- High-step days: ${summary.totals.highStepDays}; step trend: ${formatStepTrend(summary)}`,
      `- Rock climbing sessions: ${summary.totals.rockClimbingCount}`,
      `- Rock climbing days: ${countActivityDays(summary, "rock_climbing")}`,
      `- Weights/strength sessions: ${summary.totals.weightsCount}`,
      `- Weights/strength days: ${countActivityDays(summary, "weights", "strength")}`,
      `- Tennis sessions: ${summary.totals.tennisCount}`,
      `- Tennis days: ${countActivityDays(summary, "tennis")}`,
      `- Mobility/rest/other activity count: ${summary.totals.mobilityRestOtherCount}`,
      `- Confirmed no-run days: ${countConfirmedRestStatuses(summary)}`,
      `- True rest days: ${countConfirmedRestDays(summary)}`,
      `- Days with no activity data found: ${countMissingActivityDays(summary)}`,
    ]),
  );
  sections.push(
    renderSection("Day Type Summary", formatDayTypeSummary(summary)),
  );
  sections.push(
    renderSection("Activity Details", [formatActivityListByDay(summary)]),
  );
  sections.push(
    renderSection("Recovery Trend", [
      `- Soreness average: ${formatRounded(summary.recovery.sorenessAverage, "unknown")}`,
      `- Soreness highest: ${formatUnknown(summary.recovery.sorenessHighest, "unknown")}`,
      `- Pain reports: ${formatPainReports(summary)}`,
      `- Gait-change flags: ${formatGaitFlags(summary)}`,
      `- ${formatRecoveryMetric(summary, "Fatigue", "fatigue")}`,
      `- ${formatRecoveryMetric(summary, "Energy", "energy")}`,
      `- ${formatRecoveryMetric(summary, "Sleep", "sleepQuality")}`,
      `- ${formatRecoveryMetric(summary, "Stress", "stress")}`,
      `- Motivation notes: ${formatMotivation(summary)}`,
    ]),
  );
  sections.push(
    renderSection(
      "Garmin Wellness Summary",
      formatGarminWellnessSummary(summary),
    ),
  );
  sections.push(
    renderSection(
      "Weekly Recovery Trend Flags",
      summary.recoveryTrendFlags.bullets,
    ),
  );
  sections.push(
    renderSection("Load / Risk Flags", formatLoadRiskFlags(summary)),
  );
  sections.push(
    renderSection("Upcoming Constraints", formatUpcomingConstraints(summary)),
  );
  sections.push(
    renderSection(
      "Data Adjustments",
      summary.dataAdjustments.map((adjustment) => `- ${adjustment}`),
    ),
  );
  sections.push(
    renderSection("Data Quality Warnings", formatDataQualityWarnings(summary)),
  );
  sections.push(
    renderSection(
      "Missing Data Flags",
      summary.missingDataFlags.map((flag) => `- ${flag.message}`),
    ),
  );
  sections.push(
    renderSection(
      "Safety Flags",
      summary.safetyFlags.map(
        (flag) => `- ${flag.message} Do not diagnose; prioritize caution.`,
      ),
    ),
  );

  if (options.includeContext === true) {
    sections.push(
      renderSection("Current Plan Context", [
        `- Experience: ${formatUnknown(config.background.experienceLevel)}`,
        `- Marathon: ${config.race.name} on ${config.race.date}; goal ${config.race.goalTime}.`,
        "- Injury prevention and consistency should be prioritized over aggressive mileage jumps.",
        "- Running mileage, walking mileage, steps, and cross-training load should stay separate.",
        `- Recurring cross-training: ${formatCrossTraining(config)}`,
        `- Travel/no-running break: ${formatUnknown(summary.travelBreakNote, "not overlapping or approaching the planning week")}`,
      ]),
    );
    sections.push(
      renderSection("Data Interpretation Context", [
        "- Walking mileage is reported separately and is not counted as running mileage.",
        "- Rock climbing, tennis, weights, mobility, and steps are training-load context, not running mileage.",
        "- Do not claim marathon goal readiness from this week alone; treat ambitious race goals as stretch goals unless supported by enough recent data.",
        "- Missing values are shown as unknown or not provided.",
        "- Local export parsing omits route points and GPS coordinates from this prompt.",
      ]),
    );
  }

  sections.push(
    renderSection("Question For ChatGPT Coach", [
      "Given this weekly context, how should I structure the upcoming week? Prioritize injury prevention, consistency, and separating running mileage from walking and cross-training load. Please adjust for recovery, missed training, climbing/tennis/weights load, and upcoming constraints.",
    ]),
  );

  return `${sections.filter((section) => section !== "").join("\n\n")}\n`;
}

function renderSection(title: string | null, lines: string[]): string {
  const content =
    title === null
      ? trimBlankEdges(lines)
      : lines.filter((line) => line.trim() !== "");

  if (content.length === 0) {
    return "";
  }

  if (title === null) {
    return content.join("\n");
  }

  return [`## ${title}`, "", ...content].join("\n");
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

function formatDayTypeSummary(summary: WeeklySummary): string[] {
  const counts = new Map<string, number>();

  for (const day of summary.activityListByDay) {
    const type = day.dayLoadClassification.dayType;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return [
    ["Run-only days", counts.get("run day") ?? 0],
    ["Run-only high-step days", counts.get("run day with high step load") ?? 0],
    ["Walk-only days", counts.get("walk-only day") ?? 0],
    [
      "Tennis-only days",
      countDayTypes(counts, ["tennis day", "tennis / cross-training day"]),
    ],
    ["Climbing-only days", counts.get("climbing day") ?? 0],
    ["Strength-only days", counts.get("strength day") ?? 0],
    ["Mixed-load days", counts.get("mixed-load day") ?? 0],
    [
      "Mixed-load days containing running",
      countMixedDaysContaining(summary, "run"),
    ],
    [
      "Mixed-load days containing climbing",
      countMixedDaysContaining(summary, "rock_climbing"),
    ],
    [
      "Mixed-load days containing tennis",
      countMixedDaysContaining(summary, "tennis"),
    ],
    [
      "Mixed non-running load days",
      counts.get("mixed non-running load day") ?? 0,
    ],
    ["High-step no-run days", counts.get("high-step no-run day") ?? 0],
    ["Moderate-step no-run days", counts.get("moderate-step no-run day") ?? 0],
    ["Mobility/recovery days", counts.get("mobility/recovery day") ?? 0],
    ["Confirmed rest days", countConfirmedRestDays(summary)],
    ["Recovery-note-only days", countRecoveryNoteOnlyDays(summary)],
    ["Days with no activity data found", countMissingActivityDays(summary)],
  ].map(([label, count]) => `- ${label}: ${count}`);
}

function countDayTypes(
  counts: Map<string, number>,
  dayTypes: string[],
): number {
  return dayTypes.reduce(
    (total, dayType) => total + (counts.get(dayType) ?? 0),
    0,
  );
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

function formatActivityMiles(activity: ManualActivity): string {
  const miles =
    activity.distanceMiles === null
      ? null
      : formatMiles(activity.distanceMiles);

  if (miles === null) {
    return "unknown";
  }

  return activity.distanceSource === "manual_full_session"
    ? `${miles} full session`
    : miles;
}

function formatActivityDuration(activity: ManualActivity): string {
  if (activity.durationMinutes === null) {
    return "unknown";
  }

  const duration = formatMinutes(activity.durationMinutes);

  return activity.durationSource === "manual_full_session"
    ? `${duration} full session`
    : duration;
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
    formatActivityType(activity),
    activity.distanceMiles === null ? null : formatActivityMiles(activity),
    activity.durationMinutes === null ? null : formatActivityDuration(activity),
    formatRunWalkRatio(activity.runWalkStructure),
    activity.avgHr === null ? null : `Avg HR ${activity.avgHr}`,
    activity.calories === null || activity.calories === undefined
      ? null
      : `${Math.round(activity.calories)} calories`,
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
        const dayType = day.dayLoadClassification.dayType;

        if (day.confirmedRest && dayType === "true rest day") {
          return `- ${day.date}: confirmed no-run/rest day`;
        }

        if (
          dayType === "high-step no-run day" ||
          dayType === "moderate-step no-run day"
        ) {
          return `- ${day.date}: ${dayType}; ${
            day.confirmedRest
              ? "confirmed no-run/rest noted"
              : "no imported or manual activities"
          }`;
        }

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
  if (isTennisActivity(activity)) {
    return formatTennisActivity(activity);
  }

  if (hasManualFullSessionCorrection(activity)) {
    const metrics = formatRetainedDeviceMetrics(activity);

    return [
      formatActivityType(activity),
      activity.distanceMiles === null ? null : formatActivityMiles(activity),
      activity.durationMinutes === null
        ? null
        : formatActivityDuration(activity),
      formatRunWalkRatio(activity.runWalkStructure),
      formatManualCorrectionLabel(activity),
      metrics.length === 0
        ? null
        : `Garmin-recorded metrics retained: ${metrics.join(", ")}`,
      "route details omitted",
    ]
      .filter((value): value is string => value !== null)
      .join(", ");
  }

  return [
    formatActivityType(activity),
    activity.distanceMiles === null ? null : formatActivityMiles(activity),
    activity.durationMinutes === null ? null : formatActivityDuration(activity),
    formatRunWalkRatio(activity.runWalkStructure),
    activity.avgHr === null ? null : `Avg HR ${activity.avgHr}`,
    activity.maxHr === null ? null : `Max HR ${activity.maxHr}`,
    activity.elevationGainFt === null || activity.elevationGainFt === undefined
      ? null
      : `Elevation gain ${Math.round(activity.elevationGainFt)} ft`,
    activity.elevationLossFt === null || activity.elevationLossFt === undefined
      ? null
      : `Elevation loss ${Math.round(activity.elevationLossFt)} ft`,
    activity.avgCadence === null || activity.avgCadence === undefined
      ? null
      : `Cadence ${Math.round(activity.avgCadence)} spm`,
    activity.avgPowerWatts === null || activity.avgPowerWatts === undefined
      ? null
      : `Avg power ${Math.round(activity.avgPowerWatts)} W`,
    activity.calories === null || activity.calories === undefined
      ? null
      : `${Math.round(activity.calories)} calories`,
    formatTemperature(activity),
    `source ${formatActivitySource(activity.source)}`,
    "route details omitted",
  ]
    .filter((value): value is string => value !== null)
    .join(", ");
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") {
    start += 1;
  }

  while (end > start && lines[end - 1].trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end);
}

function hasManualFullSessionCorrection(activity: ManualActivity): boolean {
  return (
    activity.distanceSource === "manual_full_session" ||
    activity.durationSource === "manual_full_session"
  );
}

function formatManualCorrectionLabel(activity: ManualActivity): string {
  if (
    activity.distanceSource === "manual_full_session" &&
    activity.durationSource === "manual_full_session"
  ) {
    return "manual full-session distance/duration";
  }

  if (activity.distanceSource === "manual_full_session") {
    return "manual full-session distance";
  }

  return "manual full-session duration";
}

function formatRetainedDeviceMetrics(activity: ManualActivity): string[] {
  return [
    activity.avgHr === null ? null : `Avg HR ${activity.avgHr}`,
    activity.maxHr === null ? null : `Max HR ${activity.maxHr}`,
    activity.elevationGainFt === null || activity.elevationGainFt === undefined
      ? null
      : `Elevation gain ${Math.round(activity.elevationGainFt)} ft`,
    activity.elevationLossFt === null || activity.elevationLossFt === undefined
      ? null
      : `Elevation loss ${Math.round(activity.elevationLossFt)} ft`,
    activity.avgCadence === null || activity.avgCadence === undefined
      ? null
      : `Cadence ${Math.round(activity.avgCadence)} spm`,
    activity.avgPowerWatts === null || activity.avgPowerWatts === undefined
      ? null
      : `Avg power ${Math.round(activity.avgPowerWatts)} W`,
    activity.calories === null || activity.calories === undefined
      ? null
      : `${Math.round(activity.calories)} calories`,
    formatTemperature(activity),
  ].filter((value): value is string => value !== null);
}

function formatTennisActivity(activity: ManualActivity): string {
  return [
    formatActivityType(activity),
    activity.durationMinutes === null
      ? null
      : formatMinutes(activity.durationMinutes),
    activity.distanceMiles === null
      ? null
      : `device-estimated movement ${formatMiles(activity.distanceMiles)}`,
    activity.avgHr === null ? null : `Avg HR ${activity.avgHr}`,
    activity.maxHr === null ? null : `Max HR ${activity.maxHr}`,
    activity.calories === null || activity.calories === undefined
      ? null
      : `${Math.round(activity.calories)} calories`,
    activity.trainingEffect === null || activity.trainingEffect === undefined
      ? null
      : `Aerobic training effect ${Number(activity.trainingEffect.toFixed(1))}`,
    formatTemperature(activity),
    `source ${formatActivitySource(activity.source)}`,
    "route details omitted",
  ]
    .filter((value): value is string => value !== null)
    .join(", ");
}

function formatTemperature(activity: ManualActivity): string | null {
  if (activity.temperatureF !== null && activity.temperatureF !== undefined) {
    return `Avg temp ${Number(activity.temperatureF.toFixed(1))} F`;
  }

  if (activity.temperatureC !== null && activity.temperatureC !== undefined) {
    return `Avg temp ${Math.round(activity.temperatureC)} C`;
  }

  return null;
}

function formatActivitySource(source: string): string {
  switch (source) {
    case "garmin_fit_export":
      return "Garmin FIT export";
    case "strava_fit_export":
      return "Strava FIT export";
    case "garmin_csv_export":
      return "Garmin CSV export";
    case "strava_csv_export":
      return "Strava CSV export";
    case "journal":
      return "journal";
    case "manual":
      return "manual entry";
    default:
      return source.replaceAll("_", " ");
  }
}

function formatActivityType(activity: ManualActivity): string {
  return formatRunWalkRatio(activity.runWalkStructure) === null
    ? activity.activityType
    : "run/walk";
}

function countConfirmedRestDays(summary: WeeklySummary): number {
  return summary.activityListByDay.filter(
    (day) => day.dayLoadClassification.dayType === "true rest day",
  ).length;
}

function countConfirmedRestStatuses(summary: WeeklySummary): number {
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

function countRecoveryNoteOnlyDays(summary: WeeklySummary): number {
  return summary.activityListByDay.filter(
    (day) =>
      day.activities.length === 0 &&
      !day.confirmedRest &&
      day.dayLoadClassification.dayType === "no-run day" &&
      (day.hasJournal || day.hasRecoveryNotes),
  ).length;
}

function countActivityDays(
  summary: WeeklySummary,
  ...activityTypes: string[]
): number {
  const types = new Set(activityTypes);

  return summary.activityListByDay.filter((day) =>
    day.activities.some((activity) =>
      types.has(activity.activityType.trim().toLowerCase()),
    ),
  ).length;
}

function countMixedDaysContaining(
  summary: WeeklySummary,
  activityType: string,
): number {
  return summary.activityListByDay.filter(
    (day) =>
      day.dayLoadClassification.dayType === "mixed-load day" &&
      day.activities.some(
        (activity) =>
          activity.activityType.trim().toLowerCase() === activityType,
      ),
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

function formatGarminWellnessSummary(summary: WeeklySummary): string[] {
  const totals = summary.totals;

  if (totals.wellnessCoverageDays === 0) {
    return ["- Coverage: 0/7 days; no Garmin wellness data found."];
  }

  return [
    `- Coverage: ${totals.wellnessCoverageDays}/7 days`,
    totals.averageSleepDurationMinutes === null
      ? "- Sleep duration: limited context"
      : `- Sleep duration: average ${formatDurationMinutes(totals.averageSleepDurationMinutes)}`,
    totals.averageSleepScore === null
      ? "- Sleep score: limited context"
      : `- Sleep score: average ${formatRounded(totals.averageSleepScore, "unknown")}`,
    totals.averageRestingHeartRate === null
      ? "- Resting HR: limited context"
      : `- Resting HR: average ${formatRounded(totals.averageRestingHeartRate, "unknown")} bpm`,
    totals.hrvStatusCoverageDays < 3
      ? "- HRV: limited context"
      : `- HRV: available for ${totals.hrvStatusCoverageDays}/7 days`,
    totals.averageGarminStress === null
      ? "- Garmin stress: limited context"
      : `- Garmin stress: average ${formatRounded(totals.averageGarminStress, "unknown")}`,
    `- Body Battery coverage: ${totals.bodyBatteryCoverageDays}/7 days`,
  ];
}

function formatDurationMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;

  return `${hours}h ${remainingMinutes}m`;
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

  return flags.map((flag) => `- ${flag}`);
}

function formatDataQualityWarnings(summary: WeeklySummary): string[] {
  return [
    ...formatExportWarnings(summary.exportWarnings),
    ...formatDuplicateWarnings(summary.duplicateWarnings),
    ...formatWellnessCoverageWarnings(summary),
  ];
}

function formatWellnessCoverageWarnings(summary: WeeklySummary): string[] {
  const days = summary.totals.wellnessCoverageDays;

  if (days === 0 || days >= 5) {
    return [];
  }

  return [
    `- Garmin wellness trend interpretation is limited by ${days}/7 days of coverage.`,
  ];
}

function formatUpcomingConstraints(summary: WeeklySummary): string[] {
  const constraints = [
    summary.travelBreakNote,
    isFutureConstraint(summary.planNotes)
      ? `Plan notes: ${summary.planNotes}`
      : null,
    ...summary.journalEntries
      .map((entry) => entry.coachNotes)
      .filter((note): note is string => note !== null)
      .filter(isFutureConstraint)
      .map((note) => `Upcoming journal constraint note: ${note}`),
  ].filter((value): value is string => value !== null);

  return constraints.length === 0
    ? ["- No upcoming constraints found in journals, plan notes, or config."]
    : constraints.map((constraint) => `- ${constraint}`);
}

function isFutureConstraint(value: string | null): value is string {
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

function formatHigherLoadActivities(activities: ManualActivity[]): string {
  if (activities.length === 0) {
    return "not provided";
  }

  return activities
    .map((activity) =>
      (isTennisActivity(activity)
        ? [
            activity.date,
            formatActivityType(activity),
            activity.durationMinutes === null
              ? null
              : formatMinutes(activity.durationMinutes),
            activity.avgHr === null ? null : `Avg HR ${activity.avgHr}`,
            activity.maxHr === null ? null : `Max HR ${activity.maxHr}`,
            activity.trainingEffect === null ||
            activity.trainingEffect === undefined
              ? null
              : `Aerobic training effect ${Number(activity.trainingEffect.toFixed(1))}`,
            activity.calories === null || activity.calories === undefined
              ? null
              : `${Math.round(activity.calories)} calories`,
          ]
        : [
            activity.date,
            formatActivityType(activity),
            activity.distanceMiles === null
              ? null
              : `${Number(activity.distanceMiles.toFixed(2))} mi`,
            activity.durationMinutes === null
              ? null
              : formatMinutes(activity.durationMinutes),
            formatRunWalkRatio(activity.runWalkStructure),
            activity.avgHr === null ? null : `Avg HR ${activity.avgHr}`,
            activity.calories === null || activity.calories === undefined
              ? null
              : `${Math.round(activity.calories)} calories`,
          ]
      )
        .filter((value): value is string => value !== null)
        .join(", "),
    )
    .join("; ");
}

function isTennisActivity(activity: ManualActivity): boolean {
  return activity.activityType.trim().toLowerCase() === "tennis";
}

function formatFlags(flags: string[]): string {
  if (flags.length === 0) {
    return "- None.";
  }

  return flags.map((flag) => `- ${flag}`).join("\n");
}

function formatExportWarnings(warnings: Array<{ message: string }>): string[] {
  if (warnings.length === 0) {
    return [];
  }

  return warnings.map((warning) => `- ${warning.message}`);
}

function formatDuplicateWarnings(
  warnings: Array<{ message: string; excludedFromTotals: boolean }>,
): string[] {
  if (warnings.length === 0) {
    return [];
  }

  return warnings.map((warning) => `- ${warning.message}`);
}
