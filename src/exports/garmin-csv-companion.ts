import type { ActivityLap, ExportParseWarning, ManualActivity } from "../types";
import { formatPace } from "./parse-helpers";

export interface GarminCsvCompanion {
  summary: GarminCsvSummary;
  laps: GarminCsvLap[];
}

interface GarminCsvSummary {
  distanceMiles: number | null;
  timerTimeSeconds: number | null;
  movingTimeSeconds: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationGainFt: number | null;
  elevationLossFt: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgPowerWatts: number | null;
  maxPowerWatts: number | null;
  avgWattsPerKg: number | null;
  maxWattsPerKg: number | null;
  avgGroundContactTimeMs: number | null;
  avgStrideLengthMeters: number | null;
  avgVerticalOscillationCm: number | null;
  avgVerticalRatioPct: number | null;
  calories: number | null;
  temperatureF: number | null;
  gapPaceMinPerMile: string | null;
  avgMovingPaceMinPerMile: string | null;
  bestPaceMinPerMile: string | null;
}

interface GarminCsvLap {
  lapNumber: number;
  distanceMiles: number | null;
  durationSeconds: number | null;
  movingTimeSeconds: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationGainFt: number | null;
  elevationLossFt: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgPowerWatts: number | null;
  maxPowerWatts: number | null;
  avgWattsPerKg: number | null;
  maxWattsPerKg: number | null;
  avgGroundContactTimeMs: number | null;
  avgStrideLengthMeters: number | null;
  avgVerticalOscillationCm: number | null;
  avgVerticalRatioPct: number | null;
  calories: number | null;
  temperatureF: number | null;
  gapPaceMinPerMile: string | null;
  movingPaceMinPerMile: string | null;
  bestPaceMinPerMile: string | null;
}

type CsvRow = string[];

const DISTANCE_TOLERANCE_MILES = 0.03;
const DURATION_TOLERANCE_SECONDS = 90;

export function parseGarminCsvCompanion(
  content: string,
): GarminCsvCompanion | null {
  const rows = content
    .split(/\r?\n/)
    .map(parseCsvLine)
    .filter((row) => row.some((cell) => cell.trim() !== ""));
  const summary = summaryFromRows(rows);
  const laps = lapsFromRows(rows);
  const hasGarminSpecificMetrics =
    summary.movingTimeSeconds !== null ||
    summary.elevationGainFt !== null ||
    summary.avgCadence !== null ||
    laps.length > 0;

  if (!hasGarminSpecificMetrics) {
    return null;
  }

  return { summary, laps };
}

export function applyGarminCsvCompanions(
  activities: ManualActivity[],
  companions: GarminCsvCompanion[],
): ExportParseWarning[] {
  const warnings: ExportParseWarning[] = [];

  for (const companion of companions) {
    const candidate = findCompanionActivity(activities, companion);

    if (!candidate) {
      warnings.push({
        source: "garmin_export",
        extension: ".csv",
        message:
          "Garmin CSV companion was not confidently matched to a FIT activity; CSV summary was ignored.",
      });
      continue;
    }

    mergeCompanion(candidate, companion, warnings);
  }

  return warnings;
}

function summaryFromRows(rows: CsvRow[]): GarminCsvSummary {
  const values = new Map<string, string>();

  for (let index = 0; index < rows.length; index += 1) {
    const header = rows[index];
    const summaryRow = rows
      .slice(index + 1)
      .find((row) => normalizeKey(row[0] ?? "") === "summary");

    if (!summaryRow || !isLapSummaryHeader(header)) {
      continue;
    }

    for (let column = 0; column < header.length; column += 1) {
      addValue(values, header[column], summaryRow[column] ?? "");
    }

    break;
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    if (isLapSummaryHeader(row)) {
      continue;
    }

    if (row.length >= 2) {
      addValue(values, row[0], row[1]);
    }

    const next = rows[index + 1];

    if (!next || row.length < 2 || next.length !== row.length) {
      continue;
    }

    for (let column = 0; column < row.length; column += 1) {
      addValue(values, row[column], next[column]);
    }
  }

  return {
    distanceMiles: firstNumber(values, ["distance"]),
    timerTimeSeconds: firstDuration(values, ["time", "timer time"]),
    movingTimeSeconds: firstDuration(values, ["moving time"]),
    avgHr: firstInteger(values, ["avg hr", "average heart rate"]),
    maxHr: firstInteger(values, ["max hr", "maximum heart rate"]),
    elevationGainFt: firstNumber(values, ["total ascent", "elevation gain"]),
    elevationLossFt: firstNumber(values, ["total descent", "elevation loss"]),
    avgCadence: firstInteger(values, ["avg run cadence", "average cadence"]),
    maxCadence: firstInteger(values, ["max run cadence", "maximum cadence"]),
    avgPowerWatts: firstInteger(values, ["avg power"]),
    maxPowerWatts: firstInteger(values, ["max power"]),
    avgWattsPerKg: firstNumber(values, ["avg w kg", "avg watts kg"]),
    maxWattsPerKg: firstNumber(values, ["max w kg", "max watts kg"]),
    avgGroundContactTimeMs: firstNumber(values, ["avg ground contact time"]),
    avgStrideLengthMeters: firstNumber(values, ["avg stride length"]),
    avgVerticalOscillationCm: firstNumber(values, ["avg vertical oscillation"]),
    avgVerticalRatioPct: firstNumber(values, ["avg vertical ratio"]),
    calories: firstInteger(values, ["calories"]),
    temperatureF: firstTemperatureF(values),
    gapPaceMinPerMile: firstPace(values, ["avg gap"]),
    avgMovingPaceMinPerMile: firstPace(values, ["avg moving pace"]),
    bestPaceMinPerMile: firstPace(values, ["best pace"]),
  };
}

function lapsFromRows(rows: CsvRow[]): GarminCsvLap[] {
  const headerIndex = rows.findIndex((row) => {
    const keys = row.map(normalizeKey);

    return isLapSummaryHeader(row) && keys.some((key) => key.includes("time"));
  });

  if (headerIndex === -1) {
    return [];
  }

  const header = rows[headerIndex];
  const laps: GarminCsvLap[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const lapNumber = parseInteger(cellByHeader(header, row, ["lap", "laps"]));

    if (lapNumber === null) {
      if (laps.length > 0) {
        break;
      }

      continue;
    }

    laps.push({
      lapNumber,
      distanceMiles: parseNumber(cellByHeader(header, row, ["distance"])),
      durationSeconds: parseDurationSeconds(
        cellByHeader(header, row, ["time", "total time"]),
      ),
      movingTimeSeconds: parseDurationSeconds(
        cellByHeader(header, row, ["moving time"]),
      ),
      avgHr: parseInteger(
        cellByHeader(header, row, ["avg hr", "average heart rate"]),
      ),
      maxHr: parseInteger(
        cellByHeader(header, row, ["max hr", "maximum heart rate"]),
      ),
      elevationGainFt: parseNumber(
        cellByHeader(header, row, ["total ascent", "elevation gain"]),
      ),
      elevationLossFt: parseNumber(
        cellByHeader(header, row, ["total descent", "elevation loss"]),
      ),
      avgCadence: parseInteger(
        cellByHeader(header, row, ["avg run cadence", "average cadence"]),
      ),
      maxCadence: parseInteger(
        cellByHeader(header, row, ["max run cadence", "maximum cadence"]),
      ),
      avgPowerWatts: parseInteger(cellByHeader(header, row, ["avg power"])),
      maxPowerWatts: parseInteger(cellByHeader(header, row, ["max power"])),
      avgWattsPerKg: parseNumber(cellByHeader(header, row, ["avg w kg"])),
      maxWattsPerKg: parseNumber(cellByHeader(header, row, ["max w kg"])),
      avgGroundContactTimeMs: parseNumber(
        cellByHeader(header, row, ["avg ground contact time"]),
      ),
      avgStrideLengthMeters: parseNumber(
        cellByHeader(header, row, ["avg stride length"]),
      ),
      avgVerticalOscillationCm: parseNumber(
        cellByHeader(header, row, ["avg vertical oscillation"]),
      ),
      avgVerticalRatioPct: parseNumber(
        cellByHeader(header, row, ["avg vertical ratio"]),
      ),
      calories: parseInteger(cellByHeader(header, row, ["calories"])),
      temperatureF: parseTemperatureF(
        cellByHeader(header, row, ["avg temperature"]),
      ),
      gapPaceMinPerMile: parsePace(
        cellByHeader(header, row, ["avg gap", "avg gap min mi"]),
      ),
      movingPaceMinPerMile: parsePace(
        cellByHeader(header, row, ["avg moving pace"]),
      ),
      bestPaceMinPerMile: parsePace(cellByHeader(header, row, ["best pace"])),
    });
  }

  return laps;
}

function findCompanionActivity(
  activities: ManualActivity[],
  companion: GarminCsvCompanion,
): ManualActivity | null {
  const candidates = activities.filter(
    (activity) =>
      activity.source === "garmin_fit_export" &&
      distanceClose(activity.distanceMiles, companion.summary.distanceMiles) &&
      durationClose(activity, companion.summary),
  );

  return candidates.length === 1 ? candidates[0] : null;
}

function mergeCompanion(
  activity: ManualActivity,
  companion: GarminCsvCompanion,
  warnings: ExportParseWarning[],
): void {
  const notes = activity.dataQualityNotes ?? [];
  const changed: string[] = [];

  if (companion.summary.movingTimeSeconds !== null) {
    activity.movingTimeSeconds = companion.summary.movingTimeSeconds;
    activity.durationMinutes = companion.summary.movingTimeSeconds / 60;
    activity.paceMinPerMile = formatPace(
      activity.distanceMiles,
      activity.durationMinutes,
    );
    changed.push("moving time");
  }

  activity.timerTimeSeconds =
    companion.summary.timerTimeSeconds ?? activity.timerTimeSeconds ?? null;
  activity.gapPaceMinPerMile =
    companion.summary.gapPaceMinPerMile ?? activity.gapPaceMinPerMile ?? null;
  activity.avgMovingPaceMinPerMile =
    companion.summary.avgMovingPaceMinPerMile ??
    activity.avgMovingPaceMinPerMile ??
    null;
  activity.bestPaceMinPerMile =
    companion.summary.bestPaceMinPerMile ?? activity.bestPaceMinPerMile ?? null;

  mergeNumber(activity, "avgHr", companion.summary.avgHr, 2, changed);
  mergeNumber(activity, "maxHr", companion.summary.maxHr, 2, changed);
  mergeNumber(
    activity,
    "elevationGainFt",
    companion.summary.elevationGainFt,
    5,
    changed,
  );
  mergeNumber(
    activity,
    "elevationLossFt",
    companion.summary.elevationLossFt,
    5,
    changed,
  );
  mergeNumber(activity, "avgCadence", companion.summary.avgCadence, 1, changed);
  mergeNumber(activity, "maxCadence", companion.summary.maxCadence, 1, changed);
  mergeNumber(
    activity,
    "avgPowerWatts",
    companion.summary.avgPowerWatts,
    5,
    changed,
  );
  mergeNumber(
    activity,
    "maxPowerWatts",
    companion.summary.maxPowerWatts,
    5,
    changed,
  );
  mergeNumber(
    activity,
    "avgWattsPerKg",
    companion.summary.avgWattsPerKg,
    0.1,
    changed,
  );
  mergeNumber(
    activity,
    "maxWattsPerKg",
    companion.summary.maxWattsPerKg,
    0.1,
    changed,
  );
  mergeNumber(
    activity,
    "avgGroundContactTimeMs",
    companion.summary.avgGroundContactTimeMs,
    5,
    changed,
  );
  mergeNumber(
    activity,
    "avgStrideLengthMeters",
    companion.summary.avgStrideLengthMeters,
    0.05,
    changed,
  );
  mergeNumber(
    activity,
    "avgVerticalOscillationCm",
    companion.summary.avgVerticalOscillationCm,
    0.2,
    changed,
  );
  mergeNumber(
    activity,
    "avgVerticalRatioPct",
    companion.summary.avgVerticalRatioPct,
    0.2,
    changed,
  );
  mergeNumber(activity, "calories", companion.summary.calories, 2, changed);

  if (companion.summary.temperatureF !== null) {
    activity.temperatureF = companion.summary.temperatureF;
    activity.temperatureC = (companion.summary.temperatureF - 32) * (5 / 9);
    changed.push("temperature");
  }

  if (
    activity.elapsedTimeSeconds !== null &&
    activity.elapsedTimeSeconds !== undefined &&
    activity.movingTimeSeconds !== null &&
    activity.movingTimeSeconds !== undefined &&
    activity.elapsedTimeSeconds > activity.movingTimeSeconds
  ) {
    activity.stoppedTimeSeconds =
      activity.elapsedTimeSeconds - activity.movingTimeSeconds;
  }

  mergeLaps(activity.laps ?? [], companion.laps, changed);

  if (changed.length > 0) {
    notes.push(
      `Garmin CSV companion validated or filled ${unique(changed).join(", ")}; CSV did not create a duplicate activity.`,
    );
  }

  activity.dataQualityNotes = notes;

  if (
    activity.avgHr !== null &&
    activity.maxHr !== null &&
    activity.maxHr < activity.avgHr
  ) {
    activity.maxHr = null;
    warnings.push({
      source: "garmin_fit_export",
      extension: ".fit",
      message:
        "Implausible Garmin heart-rate pairing omitted from FIT activity summary.",
    });
  }
}

function mergeLaps(
  laps: ActivityLap[],
  companionLaps: GarminCsvLap[],
  changed: string[],
): void {
  for (const lap of laps) {
    const companion = companionLaps.find(
      (candidate) =>
        candidate.lapNumber === lap.lapNumber &&
        distanceClose(lap.distanceMiles, candidate.distanceMiles),
    );

    if (!companion) {
      continue;
    }

    mergeLapNumber(lap, "avgHr", companion.avgHr, 2, changed);
    mergeLapNumber(lap, "maxHr", companion.maxHr, 2, changed);
    mergeLapNumber(
      lap,
      "elevationLossFt",
      companion.elevationLossFt,
      5,
      changed,
    );
    mergeLapNumber(
      lap,
      "elevationGainFt",
      companion.elevationGainFt,
      5,
      changed,
    );
    mergeLapNumber(lap, "avgCadence", companion.avgCadence, 1, changed);
    mergeLapNumber(lap, "maxCadence", companion.maxCadence, 1, changed);
    mergeLapNumber(lap, "avgPowerWatts", companion.avgPowerWatts, 5, changed);
    mergeLapNumber(lap, "maxPowerWatts", companion.maxPowerWatts, 5, changed);
    mergeLapNumber(lap, "avgWattsPerKg", companion.avgWattsPerKg, 0.1, changed);
    mergeLapNumber(lap, "maxWattsPerKg", companion.maxWattsPerKg, 0.1, changed);
    mergeLapNumber(
      lap,
      "avgGroundContactTimeMs",
      companion.avgGroundContactTimeMs,
      5,
      changed,
    );
    mergeLapNumber(
      lap,
      "avgStrideLengthMeters",
      companion.avgStrideLengthMeters,
      0.05,
      changed,
    );
    mergeLapNumber(
      lap,
      "avgVerticalOscillationCm",
      companion.avgVerticalOscillationCm,
      0.2,
      changed,
    );
    mergeLapNumber(
      lap,
      "avgVerticalRatioPct",
      companion.avgVerticalRatioPct,
      0.2,
      changed,
    );
    mergeLapNumber(lap, "calories", companion.calories, 2, changed);

    lap.movingTimeSeconds =
      companion.movingTimeSeconds ?? lap.movingTimeSeconds ?? null;
    lap.movingPaceMinPerMile =
      companion.movingPaceMinPerMile ?? lap.movingPaceMinPerMile ?? null;
    lap.gapPaceMinPerMile =
      companion.gapPaceMinPerMile ?? lap.gapPaceMinPerMile ?? null;
    lap.bestPaceMinPerMile =
      companion.bestPaceMinPerMile ?? lap.bestPaceMinPerMile ?? null;
    lap.temperatureF = companion.temperatureF ?? lap.temperatureF ?? null;

    if (companion.durationSeconds !== null) {
      lap.durationSeconds = companion.durationSeconds;
      lap.paceMinPerMile = formatPace(
        lap.distanceMiles,
        companion.durationSeconds / 60,
      );
      changed.push("lap duration");
    }
  }
}

function mergeNumber<K extends keyof ManualActivity>(
  activity: ManualActivity,
  key: K,
  incoming: number | null,
  tolerance: number,
  changed: string[],
): void {
  if (incoming === null) {
    return;
  }

  activity[key] = incoming as ManualActivity[K];
  changed.push(String(key));
}

function mergeLapNumber<K extends keyof ActivityLap>(
  lap: ActivityLap,
  key: K,
  incoming: number | null,
  tolerance: number,
  changed: string[],
): void {
  if (incoming === null) {
    return;
  }

  lap[key] = incoming as ActivityLap[K];
  changed.push(`lap ${String(key)}`);
}

function durationClose(
  activity: ManualActivity,
  summary: GarminCsvSummary,
): boolean {
  const activitySeconds =
    activity.durationMinutes === null ? null : activity.durationMinutes * 60;
  const reference =
    summary.timerTimeSeconds ?? summary.movingTimeSeconds ?? activitySeconds;

  if (activitySeconds === null || reference === null) {
    return true;
  }

  return Math.abs(activitySeconds - reference) <= DURATION_TOLERANCE_SECONDS;
}

function distanceClose(left: number | null, right: number | null): boolean {
  if (left === null || right === null) {
    return true;
  }

  return Math.abs(left - right) <= DISTANCE_TOLERANCE_MILES;
}

function addValue(
  values: Map<string, string>,
  key: string,
  value: string,
): void {
  const normalized = normalizeKey(key);

  if (normalized !== "" && value.trim() !== "") {
    values.set(normalized, value.trim());
  }
}

function firstNumber(
  values: Map<string, string>,
  keys: string[],
): number | null {
  return firstParsed(values, keys, parseNumber);
}

function firstInteger(
  values: Map<string, string>,
  keys: string[],
): number | null {
  return firstParsed(values, keys, parseInteger);
}

function firstDuration(
  values: Map<string, string>,
  keys: string[],
): number | null {
  return firstParsed(values, keys, parseDurationSeconds);
}

function firstPace(values: Map<string, string>, keys: string[]): string | null {
  return firstParsed(values, keys, parsePace);
}

function firstTemperatureF(values: Map<string, string>): number | null {
  const value = firstParsed(
    values,
    ["avg temp", "avg temperature", "average temperature"],
    (raw) => {
      const parsed = parseNumber(raw);

      if (parsed === null) {
        return null;
      }

      if (/c/i.test(raw)) {
        return parsed * (9 / 5) + 32;
      }

      return parsed > 60 || /f/i.test(raw) ? parsed : null;
    },
  );

  return value === null ? null : Number(value.toFixed(1));
}

function parseTemperatureF(value: string | null): number | null {
  const parsed = parseNumber(value);

  if (parsed === null) {
    return null;
  }

  if (value !== null && /c/i.test(value)) {
    return Number((parsed * (9 / 5) + 32).toFixed(1));
  }

  return parsed > 60 || (value !== null && /f/i.test(value))
    ? Number(parsed.toFixed(1))
    : null;
}

function firstParsed<T>(
  values: Map<string, string>,
  keys: string[],
  parser: (value: string) => T | null,
): T | null {
  for (const key of keys) {
    const wanted = normalizeKey(key);
    const value = [...values.entries()].find(([candidate]) =>
      keyMatches(candidate, wanted),
    )?.[1];

    if (value === undefined) {
      continue;
    }

    const parsed = parser(value);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function cellByHeader(
  header: CsvRow,
  row: CsvRow,
  keys: string[],
): string | null {
  const wanted = keys.map(normalizeKey);
  const index = header.findIndex((cell) =>
    wanted.some((key) => keyMatches(normalizeKey(cell), key)),
  );

  return index === -1 ? null : (row[index] ?? null);
}

function isLapSummaryHeader(row: CsvRow): boolean {
  const keys = row.map(normalizeKey);

  return (
    keys.some((key) => key === "lap" || key === "laps") &&
    keys.some((key) => keyMatches(key, "distance"))
  );
}

function parseCsvLine(line: string): CsvRow {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  cells.push(current.trim());

  return cells;
}

function parseDurationSeconds(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }

  const cleaned = value.trim().replace(/[^\d:.]/g, "");

  if (!cleaned.includes(":")) {
    const numeric = parseNumber(cleaned);

    return numeric === null ? null : Math.round(numeric * 60);
  }

  const parts = cleaned.split(":").map((part) => Number(part));

  if (parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  if (parts.length === 3) {
    return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  if (parts.length === 2) {
    return Math.round(parts[0] * 60 + parts[1]);
  }

  return null;
}

function parsePace(value: string | null): string | null {
  const seconds = parseDurationSeconds(value);

  if (seconds === null || seconds <= 0) {
    return null;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

function parseInteger(value: string | null): number | null {
  const parsed = parseNumber(value);

  return parsed === null ? null : Math.round(parsed);
}

function parseNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function keyMatches(candidate: string, wanted: string): boolean {
  return (
    candidate === wanted ||
    candidate.startsWith(`${wanted} `) ||
    candidate.endsWith(` ${wanted}`) ||
    candidate.includes(` ${wanted} `)
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
