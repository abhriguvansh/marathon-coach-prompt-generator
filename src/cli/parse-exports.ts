import {
  parseLocalExports,
  summarizeExportScan,
} from "../exports/export-scanner";
import { loadAthleteConfig } from "../config/load";
import type { ExportParseResult, ManualActivity } from "../types";
import { secondsToReadableDuration } from "../utils/units";

export function renderExportParseSummary(
  result: ExportParseResult,
  options: { debug?: boolean } = {},
): string {
  const bySource = new Map<string, number>();
  const byType = new Map<string, number>();

  for (const activity of result.activities) {
    bySource.set(activity.source, (bySource.get(activity.source) ?? 0) + 1);
    byType.set(
      activity.activityType,
      (byType.get(activity.activityType) ?? 0) + 1,
    );
  }

  const lines = [
    "Local Export Parse Summary",
    "",
    summarizeExportScan(result.scan),
    `Parsed activities: ${result.activities.length}`,
    ...formatActivitySummaries(result.activities),
    `Activities by source: ${formatMap(bySource)}`,
    `Activities by type: ${formatMap(byType)}`,
    `Parse warnings: ${result.warnings.length}`,
  ];

  if (options.debug) {
    lines.push(...formatDebugNotes(result.activities));
  }

  for (const warning of result.warnings) {
    lines.push(`- ${warning.message}`);
  }

  lines.push(
    "",
    "Route points and GPS coordinates are omitted from this summary.",
  );

  return lines.join("\n");
}

if (require.main === module) {
  const cwd = process.cwd();
  const timezone = loadTimezone(cwd);
  const debug = process.argv.includes("--debug");

  console.log(
    renderExportParseSummary(parseLocalExports(cwd, { timezone }), { debug }),
  );
}

function loadTimezone(cwd: string): string | null {
  try {
    return (
      loadAthleteConfig(cwd, { allowExample: true }).config.timezone ?? null
    );
  } catch {
    return null;
  }
}

function formatActivitySummaries(activities: ManualActivity[]): string[] {
  if (activities.length === 0) {
    return [];
  }

  return [
    "Parsed activity details:",
    ...activities.map((activity) => `- ${formatActivity(activity)}`),
  ];
}

function formatDebugNotes(activities: ManualActivity[]): string[] {
  const notes = activities.flatMap((activity) =>
    (activity.dataQualityNotes ?? []).map(
      (note) =>
        `- ${activity.activityType} ${activity.date} ${activity.source}: ${note}`,
    ),
  );

  if (notes.length === 0) {
    return [
      "",
      "Debug metric provenance:",
      "- No additional provenance notes.",
    ];
  }

  return ["", "Debug metric provenance:", ...notes];
}

function formatActivity(activity: ManualActivity): string {
  const details = [
    activity.activityType,
    activity.source,
    activity.date,
    activity.distanceMiles === null
      ? "unknown distance"
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
    "route details omitted",
  ].filter((value): value is string => value !== null);

  const lapCount = validRenderableSplits(activity).length;

  return [
    details.join(" | "),
    lapCount > 0
      ? `  laps: ${lapCount} privacy-safe lap summaries available`
      : null,
  ]
    .filter((value): value is string => value !== null)
    .join("\n");
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
      ? "unknown duration"
      : secondsToReadableDuration(activity.durationMinutes * 60),
  ];
}

function formatActivityPace(activity: ManualActivity): string {
  if (activity.paceMinPerMile === null) {
    return "unknown pace";
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

function formatDevice(device: string | null | undefined): string | null {
  if (!device || /manufacturer\s+\d+|product\s+\d+/i.test(device)) {
    return null;
  }

  return `Device ${device}`;
}

function validRenderableSplits(activity: ManualActivity) {
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

function formatMap(values: Map<string, number>): string {
  if (values.size === 0) {
    return "none";
  }

  return [...values.entries()]
    .map(([key, count]) => `${key}: ${count}`)
    .join(", ");
}
