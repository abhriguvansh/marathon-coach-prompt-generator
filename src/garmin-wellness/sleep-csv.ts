import { basename } from "node:path";
import { parseCsvRows } from "../utils/csv";
import type {
  GarminWellnessJournalField,
  GarminWellnessSummary,
} from "./types";

export interface GarminSleepCsvParseResult {
  summaries: GarminWellnessSummary[];
  recordsRead: number;
  warnings: string[];
  debugNotes: string[];
}

type SleepFieldKey =
  | "date"
  | "sleepDurationMinutes"
  | "sleepScore"
  | "sleepQuality"
  | "deepSleepDurationMinutes"
  | "lightSleepDurationMinutes"
  | "remDurationMinutes"
  | "awakeDurationMinutes"
  | "restlessMoments"
  | "restingHeartRate"
  | "averageOvernightHeartRate"
  | "overnightHrv"
  | "hrvStatus"
  | "garminStress"
  | "bodyBattery"
  | "respirationRate"
  | "lowestRespirationRate"
  | "pulseOx"
  | "lowestPulseOx"
  | "breathingVariations";

interface ParsedEntries {
  entries: Map<SleepFieldKey, string>;
  recognizedFields: Set<SleepFieldKey>;
}

const LABELS = new Map<string, SleepFieldKey>([
  ["date", "date"],
  ["sleepduration", "sleepDurationMinutes"],
  ["sleepdurationminutes", "sleepDurationMinutes"],
  ["sleepscore", "sleepScore"],
  ["quality", "sleepQuality"],
  ["sleepquality", "sleepQuality"],
  ["deepsleepduration", "deepSleepDurationMinutes"],
  ["deepsleepdurationminutes", "deepSleepDurationMinutes"],
  ["lightsleepduration", "lightSleepDurationMinutes"],
  ["lightsleepdurationminutes", "lightSleepDurationMinutes"],
  ["remduration", "remDurationMinutes"],
  ["remdurationminutes", "remDurationMinutes"],
  ["awaketime", "awakeDurationMinutes"],
  ["awakeduration", "awakeDurationMinutes"],
  ["awakedurationminutes", "awakeDurationMinutes"],
  ["stressavg", "garminStress"],
  ["averagestress", "garminStress"],
  ["garminstress", "garminStress"],
  ["restlessmoments", "restlessMoments"],
  ["avgovernightheartrate", "averageOvernightHeartRate"],
  ["averageovernightheartrate", "averageOvernightHeartRate"],
  ["restingheartrate", "restingHeartRate"],
  ["avgrestingheartrate", "restingHeartRate"],
  ["bodybatterychange", "bodyBattery"],
  ["bodybattery", "bodyBattery"],
  ["avgspo2", "pulseOx"],
  ["averagespo2", "pulseOx"],
  ["lowestspo2", "lowestPulseOx"],
  ["minimumspo2", "lowestPulseOx"],
  ["avgrespiration", "respirationRate"],
  ["averagerespiration", "respirationRate"],
  ["lowestrespiration", "lowestRespirationRate"],
  ["minimumrespiration", "lowestRespirationRate"],
  ["avgovernighthrv", "overnightHrv"],
  ["averageovernighthrv", "overnightHrv"],
  ["overnighthrv", "overnightHrv"],
  ["hrvstatus", "hrvStatus"],
  ["breathingvariations", "breathingVariations"],
]);

const SOURCE_LABELS: Partial<
  Record<SleepFieldKey, GarminWellnessJournalField>
> = {
  sleepQuality: "Sleep",
  sleepDurationMinutes: "Sleep Duration",
  sleepScore: "Sleep Score",
  deepSleepDurationMinutes: "Deep Sleep Duration",
  lightSleepDurationMinutes: "Light Sleep Duration",
  remDurationMinutes: "REM Duration",
  awakeDurationMinutes: "Awake Duration",
  restlessMoments: "Restless Moments",
  restingHeartRate: "Resting Heart Rate",
  averageOvernightHeartRate: "Average Overnight Heart Rate",
  overnightHrv: "Overnight HRV",
  hrvStatus: "HRV Status",
  garminStress: "Garmin Stress",
  bodyBattery: "Body Battery",
  respirationRate: "Average Respiration",
  lowestRespirationRate: "Lowest Respiration",
  pulseOx: "Average SpO2",
  lowestPulseOx: "Lowest SpO2",
  breathingVariations: "Breathing Variations",
};

const MONTHS = new Map(
  [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].map((month, index) => [month, index + 1]),
);

export function isGarminSleepCsvContent(content: string): boolean {
  const parsed = parseSleepCsvEntries(content);

  return parsed.some((entry) => sleepSignalCount(entry.recognizedFields) >= 3);
}

export function parseGarminSleepCsv(
  content: string,
  input: { fallbackDate?: string | null } = {},
): GarminSleepCsvParseResult {
  const parsedEntries = parseSleepCsvEntries(content);
  const summaries: GarminWellnessSummary[] = [];
  const warnings: string[] = [];
  const debugNotes: string[] = [];
  let recordsRead = 0;

  for (const parsed of parsedEntries) {
    if (sleepSignalCount(parsed.recognizedFields) < 3) {
      continue;
    }

    const summary = summaryFromEntries(parsed.entries, input.fallbackDate);

    if (summary === null) {
      warnings.push(
        "Garmin sleep CSV row skipped because no valid wake date was found.",
      );
      continue;
    }

    recordsRead += 1;
    summaries.push(summary);
  }

  const fallbackDate = input.fallbackDate ?? null;
  const dateMismatches = summaries.filter(
    (summary) => fallbackDate !== null && summary.date !== fallbackDate,
  );

  if (dateMismatches.length > 0) {
    warnings.push(
      "Garmin sleep CSV wake date differed from the filename date hint; CSV date was used.",
    );
  }

  if (summaries.length > 0) {
    debugNotes.push(
      `Garmin sleep CSV parsed ${summaries.length} sleep candidate${summaries.length === 1 ? "" : "s"}; wake date selected from CSV content when present.`,
    );
  }

  return { summaries, recordsRead, warnings, debugNotes };
}

export function dateHintFromPath(path: string): string | null {
  const match = basename(path).match(/(\d{4}-\d{2}-\d{2})/);

  return match?.[1] ?? null;
}

function parseSleepCsvEntries(content: string): ParsedEntries[] {
  const rows = parseCsvRows(content);

  if (rows.length === 0) {
    return [];
  }

  const labelValue = parseLabelValueRows(rows);

  if (labelValue !== null) {
    return [labelValue];
  }

  return parseTabularRows(rows);
}

function parseLabelValueRows(rows: string[][]): ParsedEntries | null {
  const entries = new Map<SleepFieldKey, string>();
  const recognizedFields = new Set<SleepFieldKey>();
  let rowPairs = 0;

  for (const row of rows) {
    if (row.length < 2) {
      continue;
    }

    rowPairs += 1;
    const key = sleepFieldKey(row[0]);

    if (key === null) {
      continue;
    }

    recognizedFields.add(key);
    entries.set(key, row[1]);
  }

  if (rowPairs === 0 || sleepSignalCount(recognizedFields) < 3) {
    return null;
  }

  return { entries, recognizedFields };
}

function parseTabularRows(rows: string[][]): ParsedEntries[] {
  const [headers, ...dataRows] = rows;
  const keys = headers.map((header) => sleepFieldKey(header));

  if (keys.filter((key) => key !== null).length < 3) {
    return [];
  }

  return dataRows
    .filter((row) => row.some((value) => !isMissing(value)))
    .map((row) => {
      const entries = new Map<SleepFieldKey, string>();
      const recognizedFields = new Set<SleepFieldKey>();

      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];

        if (key === null) {
          continue;
        }

        recognizedFields.add(key);
        entries.set(key, row[index] ?? "");
      }

      return { entries, recognizedFields };
    });
}

function summaryFromEntries(
  entries: Map<SleepFieldKey, string>,
  fallbackDate: string | null | undefined,
): GarminWellnessSummary | null {
  const date = parseWakeDate(entries.get("date") ?? null, fallbackDate ?? null);

  if (date === null) {
    return null;
  }

  const summary = emptySummary(date);
  const sources: GarminWellnessSummary["fieldSources"] = {};

  setDuration(summary, sources, "sleepDurationMinutes", entries);
  setNumber(summary, sources, "sleepScore", entries, 1, 100);
  setString(summary, sources, "sleepQuality", entries, normalizeSleepQuality);
  setDuration(summary, sources, "deepSleepDurationMinutes", entries);
  setDuration(summary, sources, "lightSleepDurationMinutes", entries);
  setDuration(summary, sources, "remDurationMinutes", entries);
  setDuration(summary, sources, "awakeDurationMinutes", entries);
  setNumber(summary, sources, "restlessMoments", entries, 0, 500);
  setNumber(summary, sources, "restingHeartRate", entries, 25, 120);
  setNumber(summary, sources, "averageOvernightHeartRate", entries, 25, 180);
  setNumber(summary, sources, "overnightHrv", entries, 1, 250, [255, 65535]);
  setString(summary, sources, "hrvStatus", entries, normalizeHrvStatus);
  setNumber(summary, sources, "garminStress", entries, 0, 100);
  setString(summary, sources, "bodyBattery", entries, normalizeBodyBattery);
  setNumber(summary, sources, "respirationRate", entries, 4, 40);
  setNumber(summary, sources, "lowestRespirationRate", entries, 4, 40);
  setNumber(summary, sources, "pulseOx", entries, 50, 100);
  setNumber(summary, sources, "lowestPulseOx", entries, 50, 100);
  setString(summary, sources, "breathingVariations", entries, normalizeText);

  summary.fieldSources = sources;

  return summary;
}

function setDuration(
  summary: GarminWellnessSummary,
  sources: NonNullable<GarminWellnessSummary["fieldSources"]>,
  key: Extract<
    SleepFieldKey,
    | "sleepDurationMinutes"
    | "deepSleepDurationMinutes"
    | "lightSleepDurationMinutes"
    | "remDurationMinutes"
    | "awakeDurationMinutes"
  >,
  entries: Map<SleepFieldKey, string>,
): void {
  const value = parseDurationMinutes(entries.get(key) ?? null, key);

  if (value === null) {
    return;
  }

  summary[key] = value;
  addSource(sources, key);
}

function setNumber(
  summary: GarminWellnessSummary,
  sources: NonNullable<GarminWellnessSummary["fieldSources"]>,
  key: Extract<
    SleepFieldKey,
    | "sleepScore"
    | "restlessMoments"
    | "restingHeartRate"
    | "averageOvernightHeartRate"
    | "overnightHrv"
    | "garminStress"
    | "respirationRate"
    | "lowestRespirationRate"
    | "pulseOx"
    | "lowestPulseOx"
  >,
  entries: Map<SleepFieldKey, string>,
  min: number,
  max: number,
  sentinels: number[] = [],
): void {
  const value = parseBoundedNumber(
    entries.get(key) ?? null,
    min,
    max,
    sentinels,
  );

  if (value === null) {
    return;
  }

  summary[key] = value;
  addSource(sources, key);
}

function setString(
  summary: GarminWellnessSummary,
  sources: NonNullable<GarminWellnessSummary["fieldSources"]>,
  key: Extract<
    SleepFieldKey,
    "sleepQuality" | "hrvStatus" | "bodyBattery" | "breathingVariations"
  >,
  entries: Map<SleepFieldKey, string>,
  normalize: (value: string | null) => string | null,
): void {
  const value = normalize(entries.get(key) ?? null);

  if (value === null) {
    return;
  }

  summary[key] = value;
  addSource(sources, key);
}

function addSource(
  sources: NonNullable<GarminWellnessSummary["fieldSources"]>,
  key: SleepFieldKey,
): void {
  const label = SOURCE_LABELS[key];

  if (label !== undefined) {
    sources[label] = "garmin_sleep_csv";
  }
}

function sleepFieldKey(label: string): SleepFieldKey | null {
  const normalized = normalizeLabel(label);

  if (normalized === "7davghrv") {
    return null;
  }

  return LABELS.get(normalized) ?? null;
}

function normalizeLabel(label: string): string {
  return label
    .normalize("NFKD")
    .toLowerCase()
    .replace(/₂/g, "2")
    .replace(/[^a-z0-9]+/g, "");
}

function sleepSignalCount(fields: Set<SleepFieldKey>): number {
  return [...fields].filter((field) => field !== "date").length;
}

function parseWakeDate(
  value: string | null,
  fallbackDate: string | null,
): string | null {
  const normalized = normalizeText(value);

  if (normalized === null) {
    return fallbackDate;
  }

  const iso = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (iso) {
    return formatDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (slash) {
    const year = normalizeYear(Number(slash[3]));

    return formatDateParts(year, Number(slash[1]), Number(slash[2]));
  }

  const monthName = normalized.match(
    /^([a-z]{3,9})\.?\s+(\d{1,2})(?:,\s*(\d{4}))?$/i,
  );

  if (monthName) {
    const month = MONTHS.get(monthName[1].slice(0, 3).toLowerCase()) ?? null;
    const year = monthName[3]
      ? Number(monthName[3])
      : fallbackDateYear(fallbackDate);

    return month === null || year === null
      ? null
      : formatDateParts(year, month, Number(monthName[2]));
  }

  return null;
}

function normalizeYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function fallbackDateYear(date: string | null): number | null {
  if (date === null) {
    return null;
  }

  const match = date.match(/^(\d{4})-/);

  return match ? Number(match[1]) : null;
}

function formatDateParts(
  year: number,
  month: number,
  day: number,
): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseDurationMinutes(
  value: string | null,
  key: SleepFieldKey,
): number | null {
  const text = normalizeText(value);

  if (text === null) {
    return null;
  }

  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*m/i);

  if (hours || minutes) {
    return boundedDuration(
      (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0),
      key,
    );
  }

  const clock = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (clock) {
    const seconds = clock[3] === undefined ? 0 : Number(clock[3]);

    if (seconds >= 60) {
      return null;
    }

    return boundedDuration(
      Number(clock[1]) * 60 + Number(clock[2]) + seconds / 60,
      key,
    );
  }

  if (/\bmin(?:ute)?s?\b/i.test(text)) {
    return boundedDuration(parseNumber(text), key);
  }

  return null;
}

function boundedDuration(
  value: number | null,
  key: SleepFieldKey,
): number | null {
  if (value === null || value < 0 || value > 900) {
    return null;
  }

  if (key === "sleepDurationMinutes" && value < 60) {
    return null;
  }

  return Math.round(value);
}

function parseBoundedNumber(
  value: string | null,
  min: number,
  max: number,
  sentinels: number[],
): number | null {
  const parsed = parseNumber(value);

  if (
    parsed === null ||
    sentinels.includes(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    return null;
  }

  return parsed;
}

function parseNumber(value: string | null): number | null {
  const text = normalizeText(value);

  if (text === null) {
    return null;
  }

  const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);

  return match ? Number(match[0]) : null;
}

function normalizeSleepQuality(value: string | null): string | null {
  const text = normalizeText(value);

  if (text === null) {
    return null;
  }

  const normalized = text.toLowerCase();

  if (["excellent", "good", "fair", "poor"].includes(normalized)) {
    return normalized;
  }

  return text;
}

function normalizeHrvStatus(value: string | null): string | null {
  const text = normalizeText(value);

  if (text === null) {
    return null;
  }

  const normalized = text.toLowerCase();

  if (["no status", "nostatus"].includes(normalized)) {
    return "unavailable / no established status";
  }

  return text;
}

function normalizeBodyBattery(value: string | null): string | null {
  const text = normalizeText(value);

  if (text === null) {
    return null;
  }

  const match = text.match(/[+-]?\d+/);

  if (!match) {
    return null;
  }

  const valueNumber = Number(match[0]);

  return valueNumber >= -100 && valueNumber <= 100 ? match[0] : null;
}

function normalizeText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const stripped = value.trim().replace(/^'+/, "");
  const normalized = stripped.toLowerCase();

  if (
    stripped === "" ||
    stripped === "--" ||
    ["null", "unknown", "unavailable", "n/a", "na"].includes(normalized)
  ) {
    return null;
  }

  return stripped;
}

function isMissing(value: string): boolean {
  return normalizeText(value) === null;
}

function emptySummary(date: string): GarminWellnessSummary {
  return {
    date,
    totalSteps: null,
    sleepDurationMinutes: null,
    sleepScore: null,
    sleepQuality: null,
    deepSleepDurationMinutes: null,
    lightSleepDurationMinutes: null,
    remDurationMinutes: null,
    awakeDurationMinutes: null,
    restlessMoments: null,
    restingHeartRate: null,
    averageOvernightHeartRate: null,
    overnightHrv: null,
    hrvStatus: null,
    garminStress: null,
    bodyBattery: null,
    bodyBatteryHigh: null,
    bodyBatteryLow: null,
    bodyBatteryOnWaking: null,
    respirationRate: null,
    lowestRespirationRate: null,
    pulseOx: null,
    lowestPulseOx: null,
    breathingVariations: null,
    intensityMinutes: null,
    floorsClimbed: null,
    calories: null,
    bedtime: null,
    wakeTime: null,
    sleepStages: null,
    sourceFitFiles: 0,
    supportedRecords: 1,
    warnings: [],
    fieldSources: {},
    lowerPriorityJournalValues: {},
  };
}
