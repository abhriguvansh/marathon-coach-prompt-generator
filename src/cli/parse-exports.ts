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
  return [
    activity.activityType,
    activity.source,
    activity.date,
    activity.distanceMiles === null
      ? "unknown distance"
      : `${Number(activity.distanceMiles.toFixed(2))} mi`,
    activity.durationMinutes === null
      ? "unknown duration"
      : secondsToReadableDuration(activity.durationMinutes * 60),
    activity.paceMinPerMile === null
      ? "unknown pace"
      : `${activity.paceMinPerMile} min/mi`,
    "route details omitted",
  ].join(" | ");
}

function formatMap(values: Map<string, number>): string {
  if (values.size === 0) {
    return "none";
  }

  return [...values.entries()]
    .map(([key, count]) => `${key}: ${count}`)
    .join(", ");
}
