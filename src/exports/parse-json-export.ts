import type {
  ExportParseWarning,
  ExportSource,
  ManualActivity,
} from "../types";
import {
  buildExportActivity,
  dateFromDateTime,
  firstValue,
  kilometersValueToMiles,
  metersValueToFeet,
  metersValueToMiles,
  parseDurationMinutes,
  parseNumber,
  secondsValueToMinutes,
  timeFromDateTime,
  warning,
} from "./parse-helpers";

export function parseJsonExport(
  content: string,
  source: ExportSource,
  options: { timeZone?: string } = {},
) {
  const warnings: ExportParseWarning[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      activities: [],
      warnings: [warning(source, "JSON export could not be parsed.", ".json")],
    };
  }

  const records = normalizeJsonRecords(parsed);
  const activities: ManualActivity[] = [];

  records.forEach((record, index) => {
    const startValue = stringValue(
      firstValue(record, ["date", "startTime", "start_time", "startDate"]),
    );
    const activity = buildExportActivity({
      source,
      activityType: stringValue(
        firstValue(record, ["activityType", "activity_type", "type", "sport"]),
      ),
      startDate: dateFromDateTime(startValue, options.timeZone ?? "UTC"),
      startTime: timeFromDateTime(startValue, options.timeZone ?? "UTC"),
      distanceMiles: jsonDistanceMiles(record),
      durationMinutes: jsonDurationMinutes(record),
      elevationFt: jsonElevationFeet(record),
      avgHr: parseNumber(
        firstValue(record, ["avgHr", "averageHr", "average_hr"]),
      ),
      maxHr: parseNumber(firstValue(record, ["maxHr", "max_hr"])),
      steps: parseNumber(firstValue(record, ["steps"])),
    });

    if (!activity) {
      warnings.push(
        warning(
          source,
          `JSON activity ${index + 1} skipped because no start date was found.`,
          ".json",
        ),
      );
      return;
    }

    activities.push(activity);
  });

  return { activities, warnings };
}

function normalizeJsonRecords(parsed: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(parsed)) {
    return parsed.filter(isRecord);
  }

  if (isRecord(parsed)) {
    if (Array.isArray(parsed.activities)) {
      return parsed.activities.filter(isRecord);
    }

    if (Array.isArray(parsed.data)) {
      return parsed.data.filter(isRecord);
    }

    return [parsed];
  }

  return [];
}

function jsonDistanceMiles(record: Record<string, unknown>): number | null {
  const miles = parseNumber(
    firstValue(record, ["distanceMiles", "distance_miles"]),
  );

  if (miles !== null) {
    return miles;
  }

  const kilometers = kilometersValueToMiles(
    firstValue(record, ["distanceKilometers", "distance_km"]),
  );

  if (kilometers !== null) {
    return kilometers;
  }

  return metersValueToMiles(
    firstValue(record, ["distanceMeters", "distance_meters"]),
  );
}

function jsonDurationMinutes(record: Record<string, unknown>): number | null {
  const minutes = parseDurationMinutes(
    firstValue(record, ["durationMinutes", "duration_minutes", "movingTime"]),
  );

  if (minutes !== null) {
    return minutes;
  }

  return secondsValueToMinutes(
    firstValue(record, [
      "durationSeconds",
      "duration_seconds",
      "movingTimeSeconds",
    ]),
  );
}

function jsonElevationFeet(record: Record<string, unknown>): number | null {
  const feet = parseNumber(firstValue(record, ["elevationFt", "elevation_ft"]));

  return (
    feet ??
    metersValueToFeet(
      firstValue(record, ["elevationMeters", "elevation_meters"]),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
