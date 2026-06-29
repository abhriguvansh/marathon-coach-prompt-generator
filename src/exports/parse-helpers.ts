import type {
  ExportParseWarning,
  ExportSource,
  ManualActivity,
} from "../types";
import {
  kilometersToMiles,
  metersToMiles,
  secondsToMinutes,
} from "../utils/units";

export function buildExportActivity(input: {
  source: ExportSource;
  activityType: string | null;
  startDate: string | null;
  startTime?: string | null;
  distanceMiles: number | null;
  durationMinutes: number | null;
  elevationFt: number | null;
  elevationGainFt?: number | null;
  elevationLossFt?: number | null;
  netElevationChangeFt?: number | null;
  elevationSource?: ManualActivity["elevationSource"];
  elevationDataQuality?: string | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence?: number | null;
  maxCadence?: number | null;
  calories?: number | null;
  elapsedTimeSeconds?: number | null;
  movingTimeSeconds?: number | null;
  stoppedTimeSeconds?: number | null;
  avgSpeed?: number | null;
  maxSpeed?: number | null;
  bestPaceMinPerMile?: string | null;
  trainingEffect?: number | null;
  temperatureC?: number | null;
  device?: string | null;
  laps?: ManualActivity["laps"];
  dataQualityNotes?: string[];
  steps?: number | null;
  notes?: string | null;
}): ManualActivity | null {
  if (!input.startDate) {
    return null;
  }

  return {
    date: input.startDate,
    startTime: input.startTime ?? null,
    source: input.source,
    activityType: normalizeActivityType(input.activityType),
    distanceMiles: input.distanceMiles,
    durationMinutes: input.durationMinutes,
    paceMinPerMile: formatPace(input.distanceMiles, input.durationMinutes),
    elevationFt: input.elevationFt,
    elevationGainFt: input.elevationGainFt ?? input.elevationFt,
    elevationLossFt: input.elevationLossFt ?? null,
    netElevationChangeFt: input.netElevationChangeFt ?? null,
    elevationSource: input.elevationSource ?? null,
    elevationDataQuality: input.elevationDataQuality ?? null,
    avgHr: input.avgHr,
    maxHr: input.maxHr,
    avgCadence: input.avgCadence ?? null,
    maxCadence: input.maxCadence ?? null,
    calories: input.calories ?? null,
    elapsedTimeSeconds: input.elapsedTimeSeconds ?? null,
    movingTimeSeconds: input.movingTimeSeconds ?? null,
    stoppedTimeSeconds: input.stoppedTimeSeconds ?? null,
    avgSpeed: input.avgSpeed ?? null,
    maxSpeed: input.maxSpeed ?? null,
    bestPaceMinPerMile: input.bestPaceMinPerMile ?? null,
    trainingEffect: input.trainingEffect ?? null,
    temperatureC: input.temperatureC ?? null,
    device: input.device ?? null,
    laps: input.laps ?? [],
    runWalkStructure: null,
    dataQualityNotes: input.dataQualityNotes ?? [],
    steps: input.steps ?? null,
    notes: input.notes ?? "Parsed from local export; route details omitted.",
  };
}

export function warning(
  source: ExportSource,
  message: string,
  extension?: string,
): ExportParseWarning {
  return { source, extension, message };
}

export function normalizeActivityType(
  value: string | null | undefined,
): string {
  const normalized = (value ?? "other").trim().toLowerCase();

  if (["running", "run"].includes(normalized)) {
    return "run";
  }

  if (["walking", "walk"].includes(normalized)) {
    return "walk";
  }

  if (["hiking", "hike"].includes(normalized)) {
    return "hike";
  }

  if (
    ["strength_training", "strength training", "weighttraining"].includes(
      normalized,
    )
  ) {
    return "weights";
  }

  if (["rock climbing", "rockclimbing"].includes(normalized)) {
    return "rock_climbing";
  }

  return normalized.replaceAll(" ", "_");
}

export function dateFromDateTime(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\d{4}-\d{2}-\d{2}/);

  return match?.[0] ?? null;
}

export function timeFromDateTime(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/T?(\d{2}:\d{2}(?::\d{2})?)/);

  return match?.[1] ?? null;
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/,/g, "").trim();

  if (cleaned === "") {
    return null;
  }

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDurationMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  const parts = trimmed.split(":").map(Number);

  if (parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  if (parts.length === 3) {
    return parts[0] * 60 + parts[1] + parts[2] / 60;
  }

  if (parts.length === 2) {
    return parts[0] + parts[1] / 60;
  }

  return null;
}

export function metersValueToMiles(value: unknown): number | null {
  const meters = parseNumber(value);

  return meters === null ? null : metersToMiles(meters);
}

export function kilometersValueToMiles(value: unknown): number | null {
  const kilometers = parseNumber(value);

  return kilometers === null ? null : kilometersToMiles(kilometers);
}

export function secondsValueToMinutes(value: unknown): number | null {
  const seconds = parseNumber(value);

  return seconds === null ? null : secondsToMinutes(seconds);
}

export function metersValueToFeet(value: unknown): number | null {
  const meters = parseNumber(value);

  return meters === null ? null : meters * 3.28084;
}

export function firstValue(
  record: Record<string, unknown>,
  names: string[],
): unknown {
  const normalizedEntries = new Map<string, unknown>();

  for (const [key, value] of Object.entries(record)) {
    normalizedEntries.set(normalizeKey(key), value);
  }

  for (const name of names) {
    const value = normalizedEntries.get(normalizeKey(name));

    if (value !== undefined && value !== "") {
      return value;
    }
  }

  return undefined;
}

export function textBetween(content: string, tagName: string): string | null {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(
    new RegExp(
      `<[^:>]*:?${escapedTag}[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${escapedTag}>`,
      "i",
    ),
  );

  return match?.[1]?.trim() ?? null;
}

export function allTagBlocks(content: string, tagName: string): string[] {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = content.matchAll(
    new RegExp(
      `<[^:>]*:?${escapedTag}[^>]*>[\\s\\S]*?<\\/[^:>]*:?${escapedTag}>`,
      "gi",
    ),
  );

  return [...matches].map((match) => match[0]);
}

export function formatPace(
  distanceMiles: number | null,
  durationMinutes: number | null,
): string | null {
  if (
    !distanceMiles ||
    !durationMinutes ||
    distanceMiles <= 0 ||
    durationMinutes <= 0
  ) {
    return null;
  }

  const secondsPerMile = (durationMinutes * 60) / distanceMiles;
  const rounded = Math.round(secondsPerMile);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}
