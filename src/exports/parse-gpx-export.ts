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
import { metersToMiles } from "../utils/units";

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
    const trackPoints = parseTrackPoints(block);
    const distanceMiles =
      metersValueToMiles(
        textBetween(extensions, "distanceMeters") ??
          textBetween(extensions, "distance_meters"),
      ) ?? distanceMilesFromTrackPoints(trackPoints);
    const durationMinutes =
      durationMinutesFromExtensions(extensions) ??
      durationMinutesFromTrackPoints(trackPoints);
    const activity = buildExportActivity({
      source,
      activityType:
        textBetween(extensions, "type") ?? textBetween(block, "type") ?? "run",
      startDate: dateFromDateTime(startValue),
      startTime: timeFromDateTime(startValue),
      distanceMiles,
      durationMinutes,
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

interface TrackPoint {
  lat: number;
  lon: number;
  time: string | null;
}

function parseTrackPoints(block: string): TrackPoint[] {
  return allTagBlocks(block, "trkpt")
    .map((trackPointBlock) => {
      const lat = attributeNumber(trackPointBlock, "lat");
      const lon = attributeNumber(trackPointBlock, "lon");

      if (lat === null || lon === null) {
        return null;
      }

      return {
        lat,
        lon,
        time: textBetween(trackPointBlock, "time"),
      };
    })
    .filter((point): point is TrackPoint => point !== null);
}

function attributeNumber(
  content: string,
  attributeName: string,
): number | null {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(
    new RegExp(`\\s${escapedName}=["']([^"']+)["']`, "i"),
  );

  if (!match) {
    return null;
  }

  const value = Number(match[1]);

  return Number.isFinite(value) ? value : null;
}

function distanceMilesFromTrackPoints(points: TrackPoint[]): number | null {
  if (points.length < 2) {
    return null;
  }

  let meters = 0;

  for (let index = 1; index < points.length; index += 1) {
    meters += haversineMeters(points[index - 1], points[index]);
  }

  return metersToMiles(meters);
}

function haversineMeters(left: TrackPoint, right: TrackPoint): number {
  const earthRadiusMeters = 6_371_000;
  const lat1 = degreesToRadians(left.lat);
  const lat2 = degreesToRadians(right.lat);
  const deltaLat = degreesToRadians(right.lat - left.lat);
  const deltaLon = degreesToRadians(right.lon - left.lon);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function durationMinutesFromTrackPoints(points: TrackPoint[]): number | null {
  const timestamps = points
    .map((point) => (point.time === null ? null : Date.parse(point.time)))
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );

  if (timestamps.length < 2) {
    return null;
  }

  const durationMs = timestamps[timestamps.length - 1] - timestamps[0];

  return durationMs > 0 ? durationMs / 60_000 : null;
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
