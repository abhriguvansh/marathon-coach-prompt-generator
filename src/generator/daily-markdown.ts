import type { ActivityNote, DailySummary, ManualActivity } from "../types";
import { formatUnknown } from "../utils/format";
import { formatRecoveryValue } from "../utils/recovery";
import { formatRunWalkStructure } from "../utils/run-walk";
import { formatStepValue } from "../utils/steps";
import { secondsToReadableDuration } from "../utils/units";

export interface DailyCheckInRenderOptions {
  includeAthleteBackground?: boolean;
}

export function renderDailyCheckIn(
  summary: DailySummary,
  options: DailyCheckInRenderOptions = {},
): string {
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
    ...formatAthleteBackground(summary, options),
    "## Yesterday's Logged Activities",
    "",
    ...formatActivityGroup("Runs", summary.runs),
    ...formatActivityGroup("Walks", summary.walks),
    ...formatActivityGroup("Rock climbing", summary.rockClimbing),
    ...formatActivityGroup("Tennis", summary.tennis),
    ...formatActivityGroup("Weights/strength", summary.weights),
    ...formatActivityGroup("Mobility", summary.mobility),
    ...formatActivityGroup("Rest/other activity", summary.restOrOther),
    "",
    "## Mileage And Load",
    "",
    `- Running mileage: ${formatMiles(summary.runningMileage)}`,
    `- Walking mileage: ${formatMiles(summary.walkingMileage)}`,
    `- Steps: ${daily === null ? "unknown" : formatStepValue(daily)}`,
    "",
    "## Day Type / Load Classification",
    "",
    ...formatDayLoadClassification(summary),
    "",
    "## Recent Coaching Context",
    "",
    ...formatRecentCoachingContext(summary),
    "",
    "## Recovery Trend Flags",
    "",
    ...summary.recoveryTrendFlags.bullets,
    "",
    "## Recovery Notes",
    "",
    `- Soreness: ${formatRecoveryValue(daily?.legSoreness, "unknown")}`,
    `- Pain: ${formatRecoveryValue(daily?.pain, "unknown")}`,
    `- Pain location/type: ${formatUnknown(daily?.painLocation, "unknown")} / ${formatUnknown(daily?.painType, "unknown")}`,
    `- Gait changed: ${formatRecoveryValue(daily?.gaitChanged, "unknown")}`,
    `- Fatigue: ${formatRecoveryValue(daily?.fatigue, "unknown")}`,
    `- Energy: ${formatRecoveryValue(daily?.energy, "unknown")}`,
    `- Sleep: ${formatRecoveryValue(daily?.sleepQuality, "unknown")}`,
    ...formatDailyWellnessMetrics(summary),
    `- Stress: ${formatRecoveryValue(daily?.stress, "unknown")}`,
    `- Motivation: ${formatRecoveryValue(daily?.motivation, "unknown")}`,
    `- Daily notes: ${formatDailyNotes(summary)}`,
    "",
    "## Gear And Fueling",
    "",
    `- Gear notes: ${formatActivityNoteValues(summary.activityNotes, "gear")}`,
    `- Fueling/hydration notes: ${formatActivityNoteValues(summary.activityNotes, "fuelingHydrationNotes")}`,
    `- Journal nutrition: ${formatJournalNutrition(summary.journalEntry)}`,
    `- Journal gear: ${formatJournalGear(summary.journalEntry)}`,
    "",
    "## Coach Notes And Questions",
    "",
    `- Coach notes: ${formatUnknown(summary.journalEntry?.coachNotes, "not provided")}`,
    `- Questions from journal: ${formatUnknown(summary.journalEntry?.questionsForCoach, "not provided")}`,
    "",
    "## Plan Notes",
    "",
    formatUnknown(summary.planNotes, "not provided"),
    "",
    "## Missing Data Flags",
    "",
    formatFlags(summary.missingDataFlags.map((flag) => flag.message)),
    "",
    "## Check-In Completeness",
    "",
    ...formatCheckInCompleteness(summary),
    "",
    "## Data Quality Notes",
    "",
    "- Walking mileage is reported separately and is not counted as running mileage.",
    "- Local export parsing omits route points and GPS coordinates from this prompt.",
    ...formatExportWarnings(summary.exportWarnings),
    ...formatDuplicateWarnings(summary.duplicateWarnings),
    ...formatActivityDataQuality(summary.manualActivities),
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

function formatDailyNotes(summary: DailySummary): string {
  let notes = summary.dailyNote?.notes ?? null;

  if (notes && summary.journalEntry?.coachNotes) {
    notes = notes.replace(summary.journalEntry.coachNotes, "").trim();
  }

  if (notes && summary.journalEntry?.questionsForCoach) {
    notes = notes
      .replace(
        `Questions for coach: ${summary.journalEntry.questionsForCoach}`,
        "",
      )
      .trim();
  }

  return formatUnknown(notes === "" ? null : notes, "not provided");
}

function formatJournalNutrition(
  journalEntry: DailySummary["journalEntry"],
): string {
  if (!journalEntry) {
    return "not provided";
  }

  return formatValues([
    journalEntry.hydration === null
      ? null
      : `Hydration: ${journalEntry.hydration}`,
    journalEntry.fueling === null ? null : `Fueling: ${journalEntry.fueling}`,
    journalEntry.bodyWeight === null
      ? null
      : `Body weight: ${journalEntry.bodyWeight}`,
  ]);
}

function formatDailyWellnessMetrics(summary: DailySummary): string[] {
  const daily = summary.dailyNote;

  if (!daily) {
    return [];
  }

  return [
    daily.sleepDuration === null || daily.sleepDuration === undefined
      ? null
      : `- Sleep duration: ${daily.sleepDuration}`,
    daily.sleepScore === null || daily.sleepScore === undefined
      ? null
      : `- Sleep score: ${daily.sleepScore}`,
    daily.sleepQualityDetail === null || daily.sleepQualityDetail === undefined
      ? null
      : `- Sleep quality: ${daily.sleepQualityDetail}`,
    daily.deepSleepDuration === null || daily.deepSleepDuration === undefined
      ? null
      : `- Deep sleep duration: ${daily.deepSleepDuration}`,
    daily.lightSleepDuration === null || daily.lightSleepDuration === undefined
      ? null
      : `- Light sleep duration: ${daily.lightSleepDuration}`,
    daily.remDuration === null || daily.remDuration === undefined
      ? null
      : `- REM duration: ${daily.remDuration}`,
    daily.awakeDuration === null || daily.awakeDuration === undefined
      ? null
      : `- Awake duration: ${daily.awakeDuration}`,
    daily.restlessMoments === null || daily.restlessMoments === undefined
      ? null
      : `- Restless moments: ${daily.restlessMoments}`,
    daily.restingHeartRate === null || daily.restingHeartRate === undefined
      ? null
      : `- Resting heart rate: ${daily.restingHeartRate} bpm`,
    daily.averageOvernightHeartRate === null ||
    daily.averageOvernightHeartRate === undefined
      ? null
      : `- Average overnight heart rate: ${daily.averageOvernightHeartRate} bpm`,
    daily.overnightHrv === null || daily.overnightHrv === undefined
      ? null
      : `- Overnight HRV: ${daily.overnightHrv} ms`,
    daily.hrvStatus === null || daily.hrvStatus === undefined
      ? null
      : `- HRV status: ${daily.hrvStatus}`,
    daily.garminStress === null || daily.garminStress === undefined
      ? null
      : `- Garmin stress: ${daily.garminStress}`,
    daily.bodyBattery === null || daily.bodyBattery === undefined
      ? null
      : `- Body Battery: ${daily.bodyBattery}`,
    daily.averageRespiration === null || daily.averageRespiration === undefined
      ? null
      : `- Average respiration: ${daily.averageRespiration}`,
    daily.lowestRespiration === null || daily.lowestRespiration === undefined
      ? null
      : `- Lowest respiration: ${daily.lowestRespiration}`,
    daily.averageSpo2 === null || daily.averageSpo2 === undefined
      ? null
      : `- Average SpO2: ${daily.averageSpo2}%`,
    daily.lowestSpo2 === null || daily.lowestSpo2 === undefined
      ? null
      : `- Lowest SpO2: ${daily.lowestSpo2}%`,
    daily.breathingVariations === null ||
    daily.breathingVariations === undefined
      ? null
      : `- Breathing variations: ${daily.breathingVariations}`,
  ].filter((value): value is string => value !== null);
}

function formatJournalGear(journalEntry: DailySummary["journalEntry"]): string {
  if (!journalEntry) {
    return "not provided";
  }

  return formatValues([
    journalEntry.shoes === null ? null : `Shoes: ${journalEntry.shoes}`,
    journalEntry.equipment === null
      ? null
      : `Equipment: ${journalEntry.equipment}`,
    journalEntry.gearOtherNotes === null
      ? null
      : `Other: ${journalEntry.gearOtherNotes}`,
  ]);
}

function formatValues(values: Array<string | null>): string {
  const present = values.filter((value): value is string => value !== null);

  return present.length === 0 ? "not provided" : present.join("; ");
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

function formatActivityGroup(
  label: string,
  activities: ManualActivity[],
): string[] {
  if (activities.length === 0) {
    return [`- ${label}: not provided`];
  }

  if (
    activities.every(
      (activity) =>
        validRenderableSplits(activity).length === 0 &&
        formatRunWalkStructure(activity.runWalkStructure) === null,
    )
  ) {
    return [`- ${label}: ${activities.map(formatActivitySummary).join("; ")}`];
  }

  return [
    `- ${label}:`,
    ...activities.flatMap((activity) => [
      `  - ${formatActivitySummary(activity)}`,
      ...formatWorkoutStructureLines(activity),
      ...formatLapLines(activity),
    ]),
  ];
}

function formatActivitySummary(activity: ManualActivity): string {
  if (isTennisActivity(activity)) {
    return formatTennisActivitySummary(activity);
  }

  return [
    activity.activityType,
    activity.distanceMiles === null
      ? null
      : `${Number(activity.distanceMiles.toFixed(2))} mi`,
    ...formatTimeDetails(activity),
    formatActivityPace(activity),
    activity.bestPaceMinPerMile === null ||
    activity.bestPaceMinPerMile === undefined
      ? null
      : `Best pace ${activity.bestPaceMinPerMile} min/mi`,
    activity.avgSpeed === null || activity.avgSpeed === undefined
      ? null
      : `Avg speed ${Number(activity.avgSpeed.toFixed(1))} mph`,
    activity.maxSpeed === null || activity.maxSpeed === undefined
      ? null
      : `Max speed ${Number(activity.maxSpeed.toFixed(1))} mph`,
    activity.avgHr === null ? null : `Avg HR ${activity.avgHr}`,
    activity.maxHr === null ? null : `Max HR ${activity.maxHr}`,
    formatElevation(activity),
    activity.avgCadence === null || activity.avgCadence === undefined
      ? null
      : `Cadence ${Math.round(activity.avgCadence)} spm`,
    activity.maxCadence === null || activity.maxCadence === undefined
      ? null
      : `Max cadence ${Math.round(activity.maxCadence)} spm`,
    ...formatPowerAndDynamics(activity),
    activity.calories === null || activity.calories === undefined
      ? null
      : `${Math.round(activity.calories)} calories`,
    activity.trainingEffect === null || activity.trainingEffect === undefined
      ? null
      : `Aerobic training effect ${Number(activity.trainingEffect.toFixed(1))}`,
    formatTemperature(activity),
    formatDevice(activity.device),
    activity.notes,
  ]
    .filter((value): value is string => value !== null)
    .join(", ");
}

function formatTennisActivitySummary(activity: ManualActivity): string {
  return [
    activity.activityType,
    ...formatTennisTimeDetails(activity),
    activity.distanceMiles === null
      ? null
      : `Device-estimated movement distance ${Number(activity.distanceMiles.toFixed(2))} mi`,
    activity.avgHr === null ? null : `Avg HR ${activity.avgHr}`,
    activity.maxHr === null ? null : `Max HR ${activity.maxHr}`,
    activity.calories === null || activity.calories === undefined
      ? null
      : `${Math.round(activity.calories)} calories`,
    activity.trainingEffect === null || activity.trainingEffect === undefined
      ? null
      : `Aerobic training effect ${Number(activity.trainingEffect.toFixed(1))}`,
    activity.anaerobicTrainingEffect === null ||
    activity.anaerobicTrainingEffect === undefined
      ? null
      : `Anaerobic training effect ${Number(activity.anaerobicTrainingEffect.toFixed(1))}`,
    formatTemperature(activity),
    formatDevice(activity.device),
    activity.notes,
  ]
    .filter((value): value is string => value !== null)
    .join(", ");
}

function formatTennisTimeDetails(activity: ManualActivity): string[] {
  if (
    activity.elapsedTimeSeconds !== null &&
    activity.elapsedTimeSeconds !== undefined
  ) {
    return [
      `${secondsToReadableDuration(activity.elapsedTimeSeconds)} elapsed`,
      activity.movingTimeSeconds === null ||
      activity.movingTimeSeconds === undefined
        ? null
        : `${secondsToReadableDuration(activity.movingTimeSeconds)} active/timer`,
      activity.stoppedTimeSeconds === null ||
      activity.stoppedTimeSeconds === undefined ||
      activity.stoppedTimeSeconds <= 0
        ? null
        : `${secondsToReadableDuration(activity.stoppedTimeSeconds)} stopped/paused`,
    ].filter((value): value is string => value !== null);
  }

  return [
    activity.durationMinutes === null
      ? null
      : formatDuration(activity.durationMinutes),
  ].filter((value): value is string => value !== null);
}

function formatPowerAndDynamics(activity: ManualActivity): string[] {
  return [
    activity.avgPowerWatts === null || activity.avgPowerWatts === undefined
      ? null
      : `Avg power ${Math.round(activity.avgPowerWatts)} W`,
    activity.maxPowerWatts === null || activity.maxPowerWatts === undefined
      ? null
      : `Max power ${Math.round(activity.maxPowerWatts)} W`,
    activity.avgWattsPerKg === null || activity.avgWattsPerKg === undefined
      ? null
      : `Avg W/kg ${Number(activity.avgWattsPerKg.toFixed(2))}`,
    activity.avgGroundContactTimeMs === null ||
    activity.avgGroundContactTimeMs === undefined
      ? null
      : `GCT ${Math.round(activity.avgGroundContactTimeMs)} ms`,
    activity.avgStrideLengthMeters === null ||
    activity.avgStrideLengthMeters === undefined
      ? null
      : `Stride ${Number(activity.avgStrideLengthMeters.toFixed(2))} m`,
    activity.avgVerticalOscillationCm === null ||
    activity.avgVerticalOscillationCm === undefined
      ? null
      : `Vert osc ${Number(activity.avgVerticalOscillationCm.toFixed(1))} cm`,
    activity.avgVerticalRatioPct === null ||
    activity.avgVerticalRatioPct === undefined
      ? null
      : `Vert ratio ${Number(activity.avgVerticalRatioPct.toFixed(1))}%`,
  ].filter((value): value is string => value !== null);
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

function formatDevice(device: string | null | undefined): string | null {
  if (!device || /manufacturer\s+\d+|product\s+\d+/i.test(device)) {
    return null;
  }

  return `Device ${device}`;
}

function formatTimeDetails(activity: ManualActivity): string[] {
  if (
    activity.elapsedTimeSeconds !== null &&
    activity.elapsedTimeSeconds !== undefined
  ) {
    return [
      `${secondsToReadableDuration(activity.elapsedTimeSeconds)} elapsed`,
      activity.movingTimeSeconds === null ||
      activity.movingTimeSeconds === undefined
        ? "moving time unavailable"
        : `${secondsToReadableDuration(activity.movingTimeSeconds)} moving`,
      activity.stoppedTimeSeconds === null ||
      activity.stoppedTimeSeconds === undefined ||
      activity.stoppedTimeSeconds <= 0
        ? null
        : `${secondsToReadableDuration(activity.stoppedTimeSeconds)} stopped/paused`,
    ].filter((value): value is string => value !== null);
  }

  return [
    activity.durationMinutes === null
      ? null
      : formatDuration(activity.durationMinutes),
  ].filter((value): value is string => value !== null);
}

function formatActivityPace(activity: ManualActivity): string | null {
  if (activity.paceMinPerMile === null) {
    return null;
  }

  if (
    activity.movingTimeSeconds !== null &&
    activity.movingTimeSeconds !== undefined
  ) {
    return `${activity.paceMinPerMile} min/mi moving pace`;
  }

  if (
    activity.elapsedTimeSeconds !== null &&
    activity.elapsedTimeSeconds !== undefined
  ) {
    return `${activity.paceMinPerMile} min/mi elapsed pace`;
  }

  return `${activity.paceMinPerMile} min/mi`;
}

function formatElevation(activity: ManualActivity): string | null {
  const gain = activity.elevationGainFt ?? activity.elevationFt;
  const loss = activity.elevationLossFt;

  if (gain === null && (loss === null || loss === undefined)) {
    return null;
  }

  return [
    gain === null || gain === undefined
      ? null
      : `Elevation gain ${Math.round(gain)} ft`,
    loss === null || loss === undefined
      ? null
      : gain === null || gain === undefined
        ? `Elevation loss ${Math.round(loss)} ft`
        : `loss ${Math.round(loss)} ft`,
  ]
    .filter((value): value is string => value !== null)
    .join(", ");
}

function formatLapLines(activity: ManualActivity): string[] {
  const splits = validRenderableSplits(activity);

  if (splits.length === 0) {
    return [];
  }

  return [
    `    - Splits / Laps (${splitHeading(activity, splits)}):`,
    ...splits.map((lap, index) => {
      const distanceMiles = lap.distanceMiles;
      const isFinal =
        index === splits.length - 1 &&
        distanceMiles !== null &&
        Math.abs(distanceMiles - Math.round(distanceMiles)) > 0.05;
      const label =
        lap.label ??
        (isFinal
          ? `Final ${formatLapMiles(distanceMiles ?? 0)}`
          : `Lap ${lap.lapNumber}`);

      return `      - ${label}: ${formatLap(lap, !isFinal)}`;
    }),
    ...formatCooldownSplitNote(activity, splits),
  ];
}

function formatWorkoutStructureLines(activity: ManualActivity): string[] {
  const structure = formatRunWalkStructure(activity.runWalkStructure);

  if (structure === null) {
    return [];
  }

  return [
    `    - Workout structure: ${structure}.`,
    "    - Pacing interpretation: planned run/walk format; split variability is expected unless effort, pain, gait, or recovery worsened.",
  ];
}

function splitHeading(
  activity: ManualActivity,
  splits: NonNullable<ManualActivity["laps"]>,
): string {
  if (activity.runWalkStructure) {
    return "planned run/walk; pace variability expected";
  }

  return paceVariability(splits);
}

function formatCooldownSplitNote(
  activity: ManualActivity,
  splits: NonNullable<ManualActivity["laps"]>,
): string[] {
  const last = splits[splits.length - 1];

  if (
    !activity.runWalkStructure?.cooldownMinutes ||
    last?.distanceMiles === null ||
    last?.distanceMiles === undefined ||
    Math.abs(last.distanceMiles - Math.round(last.distanceMiles)) <= 0.05
  ) {
    return [];
  }

  return ["      - Final partial split may include cooldown/walking."];
}

function validRenderableSplits(activity: ManualActivity) {
  if (isTennisActivity(activity)) {
    return [];
  }

  const splits = activity.laps ?? [];

  if (splits.length < 2) {
    return [];
  }

  const valid = splits.filter(
    (split) =>
      !duplicatesActivity(
        split,
        activity.distanceMiles,
        activity.durationMinutes === null
          ? null
          : activity.durationMinutes * 60,
      ),
  );

  return valid.length < 2 ? [] : valid;
}

function isTennisActivity(activity: ManualActivity): boolean {
  return activity.activityType.trim().toLowerCase() === "tennis";
}

function duplicatesActivity(
  split: NonNullable<ManualActivity["laps"]>[number],
  activityDistanceMiles: number | null,
  activityDurationSeconds: number | null,
): boolean {
  const distanceDuplicate =
    split.distanceMiles !== null &&
    activityDistanceMiles !== null &&
    Math.abs(split.distanceMiles - activityDistanceMiles) <=
      Math.max(0.03, activityDistanceMiles * 0.02);
  const durationDuplicate =
    split.durationSeconds !== null &&
    activityDurationSeconds !== null &&
    Math.abs(split.durationSeconds - activityDurationSeconds) <=
      Math.max(60, activityDurationSeconds * 0.02);

  return distanceDuplicate && durationDuplicate;
}

function formatLap(
  lap: NonNullable<ManualActivity["laps"]>[number],
  includeDistance: boolean,
): string {
  return [
    !includeDistance || lap.distanceMiles === null
      ? null
      : formatLapMiles(lap.distanceMiles),
    lap.paceMinPerMile === null ? null : `${lap.paceMinPerMile} min/mi`,
    lap.avgHr === null ? null : `Avg HR ${lap.avgHr}`,
    lap.maxHr === null ? null : `Max HR ${lap.maxHr}`,
    lap.elevationGainFt === null
      ? null
      : `Elevation gain ${Math.round(lap.elevationGainFt)} ft`,
    lap.elevationLossFt === null || lap.elevationLossFt === undefined
      ? null
      : `loss ${Math.round(lap.elevationLossFt)} ft`,
    lap.avgCadence === null
      ? null
      : `Cadence ${Math.round(lap.avgCadence)} spm`,
    lap.maxCadence === null || lap.maxCadence === undefined
      ? null
      : `Max cadence ${Math.round(lap.maxCadence)} spm`,
    lap.avgPowerWatts === null || lap.avgPowerWatts === undefined
      ? null
      : `Avg power ${Math.round(lap.avgPowerWatts)} W`,
  ]
    .filter((value): value is string => value !== null)
    .join(", ");
}

function formatLapMiles(miles: number): string {
  return `${miles.toFixed(2)} mi`;
}

function paceVariability(laps: NonNullable<ManualActivity["laps"]>): string {
  const paces = laps
    .map((lap) =>
      lap.distanceMiles && lap.durationSeconds
        ? lap.durationSeconds / lap.distanceMiles
        : null,
    )
    .filter((value): value is number => value !== null);

  if (paces.length < 2) {
    return "pace variability unknown";
  }

  const first = paces[0];
  const last = paces[paces.length - 1];
  const range = Math.max(...paces) - Math.min(...paces);

  if (range <= 20) {
    return "pace variability: steady";
  }

  if (range >= 180) {
    return "pace variability: uneven / stop-start";
  }

  if (last - first >= 30 || Math.max(...paces) - first >= 30) {
    return "pace variability: mild fade";
  }

  return "pace variability: uneven / stop-start";
}

function formatDuration(minutes: number): string {
  if (Number.isInteger(minutes) && minutes < 60) {
    return `${minutes} min`;
  }

  return secondsToReadableDuration(minutes * 60);
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

function formatRecentCoachingContext(summary: DailySummary): string[] {
  if (summary.recentCoachingContext.length === 0) {
    return [
      "- Recent context limited: not enough prior activity or journal data found.",
    ];
  }

  return summary.recentCoachingContext;
}

function formatDayLoadClassification(summary: DailySummary): string[] {
  const classification = summary.dayLoadClassification;

  return [
    `- Day type: ${classification.dayType}`,
    `- Load classification: ${classification.loadClassification}`,
    `- Coaching interpretation: ${classification.coachingInterpretation}`,
  ];
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

function formatActivityDataQuality(activities: ManualActivity[]): string[] {
  const notes = new Set<string>();

  for (const activity of activities) {
    for (const note of activity.dataQualityNotes ?? []) {
      if (note.toLowerCase().includes("split summaries")) {
        continue;
      }

      notes.add(note);
    }
  }

  return [...notes].map((note) => `- ${note}`);
}

function formatCheckInCompleteness(summary: DailySummary): string[] {
  const completeness = summary.checkInCompleteness;
  const lines =
    completeness.missingHighValueFields.length === 0
      ? ["- Key subjective fields provided."]
      : [
          `- Missing high-value subjective fields: ${completeness.missingHighValueFields.join(", ")}.`,
        ];

  if (completeness.manualOnlyActivityReminder) {
    lines.push(`- ${completeness.manualOnlyActivityReminder}`);
  }

  return lines;
}

function formatAthleteBackground(
  summary: DailySummary,
  options: DailyCheckInRenderOptions,
): string[] {
  if (!options.includeAthleteBackground) {
    return [];
  }

  const config = summary.athleteConfig;

  return [
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
  ];
}
