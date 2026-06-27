import type {
  ExportParseWarning,
  ExportSource,
  ManualActivity,
} from "../types";
import {
  allTagBlocks,
  buildExportActivity,
  dateFromDateTime,
  metersValueToFeet,
  metersValueToMiles,
  textBetween,
  timeFromDateTime,
  warning,
} from "./parse-helpers";

export function parseGpxExport(content: string, source: ExportSource) {
  const trackBlocks = allTagBlocks(content, "trk");

  if (trackBlocks.length === 0) {
    return {
      activities: [],
      warnings: [
        warning(source, "GPX export contained no track blocks.", ".gpx"),
      ],
    };
  }

  const activities: ManualActivity[] = [];
  const warnings: ExportParseWarning[] = [];

  trackBlocks.forEach((block, index) => {
    const extensions = textBetween(block, "extensions") ?? "";
    const startValue = textBetween(block, "time");
    const activity = buildExportActivity({
      source,
      activityType:
        textBetween(extensions, "type") ?? textBetween(block, "type") ?? "run",
      startDate: dateFromDateTime(startValue),
      startTime: timeFromDateTime(startValue),
      distanceMiles: metersValueToMiles(
        textBetween(extensions, "distanceMeters") ??
          textBetween(extensions, "distance_meters"),
      ),
      durationMinutes: durationMinutesFromExtensions(extensions),
      elevationFt: metersValueToFeet(
        textBetween(extensions, "elevationGainMeters") ??
          textBetween(extensions, "elevation_gain_meters"),
      ),
      avgHr: null,
      maxHr: null,
    });

    if (!activity) {
      warnings.push(
        warning(
          source,
          `GPX track ${index + 1} skipped because no start date was found.`,
          ".gpx",
        ),
      );
      return;
    }

    activities.push(activity);
  });

  return { activities, warnings };
}

function durationMinutesFromExtensions(extensions: string): number | null {
  const seconds =
    textBetween(extensions, "durationSeconds") ??
    textBetween(extensions, "movingTimeSeconds") ??
    textBetween(extensions, "duration_seconds");

  if (!seconds) {
    return null;
  }

  const parsed = Number(seconds);

  return Number.isFinite(parsed) ? parsed / 60 : null;
}
