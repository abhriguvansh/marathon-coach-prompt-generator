import {
  parseLocalExports,
  summarizeExportScan,
} from "../exports/export-scanner";
import type { ExportParseResult, ManualActivity } from "../types";
import { secondsToReadableDuration } from "../utils/units";

export function renderExportParseSummary(result: ExportParseResult): string {
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
  console.log(renderExportParseSummary(parseLocalExports(process.cwd())));
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

function formatActivity(activity: ManualActivity): string {
  const details = [
    activity.activityType,
    activity.source,
    activity.date,
    activity.distanceMiles === null
      ? "unknown distance"
      : `${Number(activity.distanceMiles.toFixed(2))} mi`,
    ...formatTimeDetails(activity),
    activity.paceMinPerMile === null
      ? "unknown pace"
      : `${activity.paceMinPerMile} min/mi`,
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
    activity.calories === null || activity.calories === undefined
      ? null
      : `${Math.round(activity.calories)} calories`,
    activity.trainingEffect === null || activity.trainingEffect === undefined
      ? null
      : `Training effect ${Number(activity.trainingEffect.toFixed(1))}`,
    activity.device === null || activity.device === undefined
      ? null
      : `Device ${activity.device}`,
    "route details omitted",
  ].filter((value): value is string => value !== null);

  const lapCount = activity.laps?.length ?? 0;

  return [
    details.join(" | "),
    lapCount > 0
      ? `  laps: ${lapCount} privacy-safe lap summaries available`
      : null,
  ]
    .filter((value): value is string => value !== null)
    .join("\n");
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
        ? null
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

function formatElevation(activity: ManualActivity): string | null {
  const gain = activity.elevationGainFt ?? activity.elevationFt;
  const loss = activity.elevationLossFt;

  if (gain === null && (loss === null || loss === undefined)) {
    return null;
  }

  return [
    gain === null || gain === undefined ? null : `Elev ${Math.round(gain)} ft`,
    loss === null || loss === undefined ? null : `loss ${Math.round(loss)} ft`,
  ]
    .filter((value): value is string => value !== null)
    .join(" ");
}

function formatMap(values: Map<string, number>): string {
  if (values.size === 0) {
    return "none";
  }

  return [...values.entries()]
    .map(([key, count]) => `${key}: ${count}`)
    .join(", ");
}
