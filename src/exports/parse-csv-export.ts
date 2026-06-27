import type {
  ExportParseWarning,
  ExportSource,
  ManualActivity,
} from "../types";
import { parseCsv } from "../utils/csv";
import {
  buildExportActivity,
  dateFromDateTime,
  firstValue,
  kilometersValueToMiles,
  metersValueToFeet,
  metersValueToMiles,
  parseDurationMinutes,
  parseNumber,
  timeFromDateTime,
  warning,
} from "./parse-helpers";

export function parseCsvExport(content: string, source: ExportSource) {
  const records = parseCsv(content);
  const activities: ManualActivity[] = [];
  const warnings: ExportParseWarning[] = [];

  records.forEach((record, index) => {
    const startValue = stringValue(
      firstValue(record, [
        "date",
        "Activity Date",
        "Start Time",
        "start_time",
        "beginTimestamp",
      ]),
    );
    const activity = buildExportActivity({
      source,
      activityType: stringValue(
        firstValue(record, [
          "activity_type",
          "Activity Type",
          "type",
          "sport",
          "Sport",
        ]),
      ),
      startDate: dateFromDateTime(startValue),
      startTime: timeFromDateTime(startValue),
      distanceMiles: distanceMilesFromRecord(record),
      durationMinutes: durationMinutesFromRecord(record),
      elevationFt: elevationFeetFromRecord(record),
      avgHr: parseNumber(
        firstValue(record, [
          "avg_hr",
          "Average Heart Rate",
          "Avg HR",
          "average_hr",
        ]),
      ),
      maxHr: parseNumber(
        firstValue(record, ["max_hr", "Max Heart Rate", "Max HR", "max_hr"]),
      ),
      steps: parseNumber(firstValue(record, ["steps", "Steps"])),
    });

    if (!activity) {
      warnings.push(
        warning(
          source,
          `CSV row ${index + 2} skipped because no start date was found.`,
          ".csv",
        ),
      );
      return;
    }

    activities.push(activity);
  });

  return { activities, warnings };
}

function distanceMilesFromRecord(
  record: Record<string, string>,
): number | null {
  const directMiles = parseNumber(
    firstValue(record, [
      "distance_miles",
      "Distance Miles",
      "Distance (mi)",
      "Miles",
    ]),
  );

  if (directMiles !== null) {
    return directMiles;
  }

  const kilometers = kilometersValueToMiles(
    firstValue(record, ["distance_km", "Distance (km)", "Kilometers"]),
  );

  if (kilometers !== null) {
    return kilometers;
  }

  const meters = metersValueToMiles(
    firstValue(record, ["distance_meters", "Distance (m)", "Distance Meters"]),
  );

  if (meters !== null) {
    return meters;
  }

  return parseNumber(firstValue(record, ["Distance", "distance"]));
}

function durationMinutesFromRecord(
  record: Record<string, string>,
): number | null {
  const directMinutes = parseDurationMinutes(
    firstValue(record, [
      "duration_minutes",
      "Duration Minutes",
      "Moving Time",
      "Elapsed Time",
      "Time",
      "Duration",
    ]),
  );

  if (directMinutes !== null) {
    return directMinutes;
  }

  const seconds = parseNumber(
    firstValue(record, ["duration_seconds", "elapsed_time", "moving_time"]),
  );

  return seconds === null ? null : seconds / 60;
}

function elevationFeetFromRecord(
  record: Record<string, string>,
): number | null {
  const feet = parseNumber(
    firstValue(record, [
      "elevation_ft",
      "Elevation Gain",
      "Elevation Gain (ft)",
      "elevation_gain",
    ]),
  );

  if (feet !== null) {
    return feet;
  }

  return metersValueToFeet(
    firstValue(record, ["elevation_meters", "Elevation Gain (m)"]),
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
