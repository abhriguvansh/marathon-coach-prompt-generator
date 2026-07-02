import {
  fitTimestamp,
  type FitParsedMessage,
  parseFitMessages,
  valueNumber,
  valueString,
} from "../fit/decoder";
import { toAthleteLocalDate, toAthleteLocalTime } from "../utils/timezone";
import type { GarminWellnessSummary } from "./types";

interface WellnessAccumulator {
  date: string;
  steps: number[];
  sleepDurations: number[];
  sleepScores: number[];
  restingHeartRates: number[];
  hrvValues: number[];
  hrvStatuses: string[];
  stressValues: number[];
  bodyBatteryValues: Array<{
    value: number;
    kind: "waking" | "high" | "low" | "single";
  }>;
  respirationRates: number[];
  pulseOxValues: number[];
  intensityMinutes: number[];
  floorsClimbed: number[];
  calories: number[];
  bedtimes: string[];
  wakeTimes: string[];
  sleepStages: string[];
  sourceFiles: Set<string>;
  supportedRecords: number;
  warnings: string[];
  warningKeys: Set<string>;
}

export interface FitWellnessParseResult {
  summaries: GarminWellnessSummary[];
  supportedRecords: number;
  warnings: string[];
  debugNotes: string[];
}

const FIELD_TIMESTAMP = 253;
const GLOBAL_MONITORING = 55;
const GLOBAL_HRV = 78;
const GLOBAL_MONITORING_INFO = 103;
const GLOBAL_STRESS_LEVEL = 227;
const GLOBAL_SLEEP_LEVEL = 275;
const GLOBAL_SLEEP_SUMMARY = 346;
const GLOBAL_HRV_STATUS = 370;
const GLOBAL_DAILY_SUMMARY = 411;
const GLOBAL_SYNTHETIC_WELLNESS = 65280;

const GLOBAL_GARMIN_SLEEP_DATA = 356;
const GLOBAL_GARMIN_SLEEP_STAGE = 410;

const FIELD_SYNTHETIC_STEPS = [100];
const FIELD_MONITORING_INFO_STEPS = [3];
const FIELD_SLEEP_DURATION = [1, 10, 101];
const FIELD_SLEEP_SCORE = [2, 11, 102];
const FIELD_DAILY_RESTING_HR = [13, 103];
const FIELD_TRUSTED_OVERNIGHT_HRV = [0, 104];
const FIELD_HRV_STATUS = [5, 15, 105];
const FIELD_GARMIN_STRESS = [0, 106];
const FIELD_BODY_BATTERY = [7, 20, 107];
const FIELD_BODY_BATTERY_HIGH = [8, 21, 108];
const FIELD_BODY_BATTERY_LOW = [9, 22, 109];
const FIELD_BODY_BATTERY_WAKING = [10, 23, 110];
const FIELD_RESPIRATION = [11, 111];
const FIELD_PULSE_OX = [12, 112];
const FIELD_INTENSITY_MINUTES = [13, 113];
const FIELD_FLOORS = [14, 114];
const FIELD_CALORIES = [15, 115];
const FIELD_BEDTIME = [16, 116];
const FIELD_WAKE_TIME = [17, 117];
const FIELD_SLEEP_STAGE = [18, 118];

export function parseGarminWellnessFit(
  content: Buffer,
  sourceFile: string,
  timeZone: string,
): FitWellnessParseResult {
  const messages = parseFitMessages(content);
  const byDate = new Map<string, WellnessAccumulator>();
  const warnings: string[] = [];
  const messageCounts = new Map<number, number>();
  let supportedRecords = 0;

  for (const message of messages) {
    messageCounts.set(
      message.globalMessageNumber,
      (messageCounts.get(message.globalMessageNumber) ?? 0) + 1,
    );
    const record = wellnessRecordFromMessage(message, timeZone);

    if (record === null) {
      continue;
    }

    supportedRecords += 1;
    const accumulator = getAccumulator(byDate, record.date);
    accumulator.sourceFiles.add(sourceFile);
    accumulator.supportedRecords += 1;

    pushNumber(accumulator.steps, record.totalSteps);
    pushNumber(accumulator.sleepDurations, record.sleepDurationMinutes);
    pushNumber(accumulator.sleepScores, record.sleepScore);
    pushNumber(accumulator.restingHeartRates, record.restingHeartRate);
    pushNumber(accumulator.hrvValues, record.overnightHrv);
    pushString(accumulator.hrvStatuses, record.hrvStatus);
    pushNumber(accumulator.stressValues, record.garminStress);
    pushNumber(accumulator.respirationRates, record.respirationRate);
    pushNumber(accumulator.pulseOxValues, record.pulseOx);
    pushNumber(accumulator.intensityMinutes, record.intensityMinutes);
    pushNumber(accumulator.floorsClimbed, record.floorsClimbed);
    pushNumber(accumulator.calories, record.calories);
    pushString(accumulator.bedtimes, record.bedtime);
    pushString(accumulator.wakeTimes, record.wakeTime);
    pushString(accumulator.sleepStages, record.sleepStages);

    for (const value of record.bodyBatteryValues) {
      accumulator.bodyBatteryValues.push(value);
    }

    for (const warning of record.warnings) {
      addAccumulatorWarning(accumulator, warning.key, warning.message);
    }
  }

  return {
    summaries: [...byDate.values()].map(summaryFromAccumulator),
    supportedRecords,
    warnings,
    debugNotes: debugNotes(messageCounts),
  };
}

function wellnessRecordFromMessage(
  message: FitParsedMessage,
  timeZone: string,
):
  | (Omit<
      GarminWellnessSummary,
      "sourceFitFiles" | "supportedRecords" | "warnings" | "bodyBattery"
    > & {
      bodyBatteryValues: Array<{
        value: number;
        kind: "waking" | "high" | "low" | "single";
      }>;
      warnings: Array<{ key: string; message: string }>;
    })
  | null {
  const timestamp = timestampFromMessage(message);
  const date = toAthleteLocalDate(timestamp, timeZone);

  if (date === null) {
    return null;
  }

  switch (message.globalMessageNumber) {
    case GLOBAL_SYNTHETIC_WELLNESS:
      return {
        date,
        totalSteps: saneNumber(
          firstNumber(message, FIELD_SYNTHETIC_STEPS),
          0,
          200000,
        ),
        sleepDurationMinutes: trustedSleepDurationMinutes(
          firstNumber(message, FIELD_SLEEP_DURATION),
        ),
        sleepScore: trustedScore(firstNumber(message, FIELD_SLEEP_SCORE)),
        restingHeartRate: saneNumber(
          firstNumber(message, FIELD_DAILY_RESTING_HR),
          25,
          120,
        ),
        overnightHrv: trustedHrv(
          firstNumber(message, FIELD_TRUSTED_OVERNIGHT_HRV),
        ),
        hrvStatus: hrvStatusValue(firstValue(message, FIELD_HRV_STATUS)),
        garminStress: saneNumber(
          firstNumber(message, FIELD_GARMIN_STRESS),
          0,
          100,
        ),
        bodyBatteryHigh: saneNumber(
          firstNumber(message, FIELD_BODY_BATTERY_HIGH),
          0,
          100,
        ),
        bodyBatteryLow: saneNumber(
          firstNumber(message, FIELD_BODY_BATTERY_LOW),
          0,
          100,
        ),
        bodyBatteryOnWaking: saneNumber(
          firstNumber(message, FIELD_BODY_BATTERY_WAKING),
          0,
          100,
        ),
        respirationRate: saneNumber(
          firstNumber(message, FIELD_RESPIRATION),
          4,
          40,
        ),
        pulseOx: saneNumber(firstNumber(message, FIELD_PULSE_OX), 50, 100),
        intensityMinutes: saneNumber(
          firstNumber(message, FIELD_INTENSITY_MINUTES),
          0,
          1440,
        ),
        floorsClimbed: saneNumber(firstNumber(message, FIELD_FLOORS), 0, 500),
        calories: saneNumber(firstNumber(message, FIELD_CALORIES), 0, 10000),
        bedtime: localTimeFromField(message, FIELD_BEDTIME, timeZone),
        wakeTime: localTimeFromField(message, FIELD_WAKE_TIME, timeZone),
        sleepStages: valueString(firstValue(message, FIELD_SLEEP_STAGE)),
        bodyBatteryValues: bodyBatteryValues(message),
        warnings: invalidSyntheticWarnings(message),
      };
    case GLOBAL_MONITORING_INFO:
      return {
        ...emptyRecord(date),
        totalSteps: saneNumber(
          firstNumber(message, FIELD_MONITORING_INFO_STEPS),
          0,
          200000,
        ),
      };
    case GLOBAL_DAILY_SUMMARY:
      return {
        ...emptyRecord(date),
        restingHeartRate: saneNumber(
          firstNumber(message, FIELD_DAILY_RESTING_HR),
          25,
          120,
        ),
      };
    case GLOBAL_SLEEP_SUMMARY:
      return {
        ...emptyRecord(date),
        sleepDurationMinutes: trustedSleepDurationMinutes(
          firstNumber(message, FIELD_SLEEP_DURATION),
        ),
        sleepScore: trustedScore(firstNumber(message, FIELD_SLEEP_SCORE)),
        bedtime: localTimeFromField(message, FIELD_BEDTIME, timeZone),
        wakeTime: localTimeFromField(message, FIELD_WAKE_TIME, timeZone),
        sleepStages: valueString(firstValue(message, FIELD_SLEEP_STAGE)),
        warnings: sleepWarnings(message),
      };
    case GLOBAL_SLEEP_LEVEL:
    case GLOBAL_GARMIN_SLEEP_STAGE:
    case GLOBAL_GARMIN_SLEEP_DATA:
      return {
        ...emptyRecord(date),
        warnings: [
          {
            key: "sleep-untrusted-stage",
            message:
              "Sleep duration not imported; only untrusted sleep-stage or segment records were found.",
          },
        ],
      };
    case GLOBAL_HRV:
    case GLOBAL_HRV_STATUS:
      return {
        ...emptyRecord(date),
        overnightHrv: trustedHrv(
          firstNumber(message, FIELD_TRUSTED_OVERNIGHT_HRV),
        ),
        hrvStatus: hrvStatusValue(firstValue(message, FIELD_HRV_STATUS)),
        warnings: hrvWarnings(message),
      };
    case GLOBAL_STRESS_LEVEL:
      return {
        ...emptyRecord(date),
        garminStress: saneNumber(
          firstNumber(message, FIELD_GARMIN_STRESS),
          0,
          100,
        ),
        bodyBatteryValues: bodyBatteryValues(message),
      };
    case GLOBAL_MONITORING:
      return {
        ...emptyRecord(date),
        warnings: [
          {
            key: "monitoring-samples-ignored",
            message:
              "Sample-level monitoring fields were ignored for resting HR, sleep, and HRV.",
          },
        ],
      };
    default:
      return null;
  }
}

function getAccumulator(
  byDate: Map<string, WellnessAccumulator>,
  date: string,
): WellnessAccumulator {
  const existing = byDate.get(date);

  if (existing) {
    return existing;
  }

  const created: WellnessAccumulator = {
    date,
    steps: [],
    sleepDurations: [],
    sleepScores: [],
    restingHeartRates: [],
    hrvValues: [],
    hrvStatuses: [],
    stressValues: [],
    bodyBatteryValues: [],
    respirationRates: [],
    pulseOxValues: [],
    intensityMinutes: [],
    floorsClimbed: [],
    calories: [],
    bedtimes: [],
    wakeTimes: [],
    sleepStages: [],
    sourceFiles: new Set<string>(),
    supportedRecords: 0,
    warnings: [],
    warningKeys: new Set<string>(),
  };
  byDate.set(date, created);

  return created;
}

function emptyRecord(date: string): Omit<
  GarminWellnessSummary,
  "sourceFitFiles" | "supportedRecords" | "warnings" | "bodyBattery"
> & {
  bodyBatteryValues: Array<{
    value: number;
    kind: "waking" | "high" | "low" | "single";
  }>;
  warnings: Array<{ key: string; message: string }>;
} {
  return {
    date,
    totalSteps: null,
    sleepDurationMinutes: null,
    sleepScore: null,
    restingHeartRate: null,
    overnightHrv: null,
    hrvStatus: null,
    garminStress: null,
    bodyBatteryHigh: null,
    bodyBatteryLow: null,
    bodyBatteryOnWaking: null,
    respirationRate: null,
    pulseOx: null,
    intensityMinutes: null,
    floorsClimbed: null,
    calories: null,
    bedtime: null,
    wakeTime: null,
    sleepStages: null,
    bodyBatteryValues: [],
    warnings: [],
  };
}

function summaryFromAccumulator(
  accumulator: WellnessAccumulator,
): GarminWellnessSummary {
  const bodyBatteryHigh =
    maxNumber([
      ...accumulator.bodyBatteryValues
        .filter((value) => value.kind === "high")
        .map((value) => value.value),
      ...accumulator.bodyBatteryValues.map((value) => value.value),
    ]) ?? null;
  const bodyBatteryLow =
    minNumber([
      ...accumulator.bodyBatteryValues
        .filter((value) => value.kind === "low")
        .map((value) => value.value),
      ...accumulator.bodyBatteryValues.map((value) => value.value),
    ]) ?? null;
  const bodyBatteryOnWaking =
    lastNumber(
      accumulator.bodyBatteryValues
        .filter((value) => value.kind === "waking")
        .map((value) => value.value),
    ) ?? null;

  return {
    date: accumulator.date,
    totalSteps: maxNumber(accumulator.steps),
    sleepDurationMinutes: maxNumber(accumulator.sleepDurations),
    sleepScore: lastNumber(accumulator.sleepScores),
    restingHeartRate: lastNumber(accumulator.restingHeartRates),
    overnightHrv: lastNumber(accumulator.hrvValues),
    hrvStatus: lastString(accumulator.hrvStatuses),
    garminStress:
      lastNumber(accumulator.stressValues) ??
      roundedAverage(accumulator.stressValues),
    bodyBattery: bodyBatteryDisplay({
      waking: bodyBatteryOnWaking,
      high: bodyBatteryHigh,
      low: bodyBatteryLow,
    }),
    bodyBatteryHigh,
    bodyBatteryLow,
    bodyBatteryOnWaking,
    respirationRate: roundedAverage(accumulator.respirationRates),
    pulseOx: roundedAverage(accumulator.pulseOxValues),
    intensityMinutes: maxNumber(accumulator.intensityMinutes),
    floorsClimbed: maxNumber(accumulator.floorsClimbed),
    calories: maxNumber(accumulator.calories),
    bedtime: lastString(accumulator.bedtimes),
    wakeTime: lastString(accumulator.wakeTimes),
    sleepStages: lastString(accumulator.sleepStages),
    sourceFitFiles: accumulator.sourceFiles.size,
    supportedRecords: accumulator.supportedRecords,
    warnings: accumulator.warnings,
  };
}

function timestampFromMessage(message: FitParsedMessage): string | null {
  return fitTimestamp(valueNumber(message.fields[FIELD_TIMESTAMP]));
}

function firstValue(
  message: FitParsedMessage,
  fieldNumbers: number[],
): ReturnType<typeof valueFromField> {
  for (const fieldNumber of fieldNumbers) {
    const value = valueFromField(message, fieldNumber);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function firstNumber(
  message: FitParsedMessage,
  fieldNumbers: number[],
): number | null {
  return valueNumber(firstValue(message, fieldNumbers));
}

function valueFromField(message: FitParsedMessage, fieldNumber: number) {
  const value = message.fields[fieldNumber];

  return value === undefined ? null : value;
}

function localTimeFromField(
  message: FitParsedMessage,
  fieldNumbers: number[],
  timeZone: string,
): string | null {
  const timestamp = fitTimestamp(firstNumber(message, fieldNumbers));

  return toAthleteLocalTime(timestamp, timeZone);
}

function scaledDurationMinutes(value: number | null): number | null {
  if (value === null || value <= 0) {
    return null;
  }

  return value > 1440 ? value / 60 : value;
}

function trustedSleepDurationMinutes(value: number | null): number | null {
  const minutes = scaledDurationMinutes(value);

  if (minutes === null || minutes < 60 || minutes > 900) {
    return null;
  }

  return minutes;
}

function trustedScore(value: number | null): number | null {
  if (value === null || value <= 0 || value > 100) {
    return null;
  }

  return Math.round(value);
}

function trustedHrv(value: number | null): number | null {
  if (
    value === null ||
    value <= 0 ||
    value === 255 ||
    value === 65535 ||
    value > 250
  ) {
    return null;
  }

  return Math.round(value);
}

function bodyBatteryValues(message: FitParsedMessage): Array<{
  value: number;
  kind: "waking" | "high" | "low" | "single";
}> {
  const values: Array<{
    value: number;
    kind: "waking" | "high" | "low" | "single";
  }> = [];
  const single = saneNumber(firstNumber(message, FIELD_BODY_BATTERY), 0, 100);
  const high = saneNumber(
    firstNumber(message, FIELD_BODY_BATTERY_HIGH),
    0,
    100,
  );
  const low = saneNumber(firstNumber(message, FIELD_BODY_BATTERY_LOW), 0, 100);
  const waking = saneNumber(
    firstNumber(message, FIELD_BODY_BATTERY_WAKING),
    0,
    100,
  );

  if (single !== null) {
    values.push({ value: single, kind: "single" });
  }

  if (high !== null) {
    values.push({ value: high, kind: "high" });
  }

  if (low !== null) {
    values.push({ value: low, kind: "low" });
  }

  if (waking !== null) {
    values.push({ value: waking, kind: "waking" });
  }

  return values;
}

function bodyBatteryDisplay(input: {
  waking: number | null;
  high: number | null;
  low: number | null;
}): string | null {
  if (input.waking !== null) {
    return `${input.waking} on waking`;
  }

  if (input.high !== null && input.low !== null) {
    return `${input.low}-${input.high}`;
  }

  if (input.high !== null) {
    return `${input.high} high`;
  }

  if (input.low !== null) {
    return `${input.low} low`;
  }

  return null;
}

function hrvStatusValue(
  value: ReturnType<typeof valueFromField>,
): string | null {
  const text = valueString(value);

  if (
    text !== null &&
    !["unknown", "unavailable"].includes(text.toLowerCase())
  ) {
    return text;
  }

  const number = valueNumber(value);

  switch (number) {
    case 0:
      return null;
    case 1:
      return "balanced";
    case 2:
      return "unbalanced";
    case 3:
      return "low";
    case 4:
      return "poor";
    default:
      return null;
  }
}

function sleepWarnings(
  message: FitParsedMessage,
): Array<{ key: string; message: string }> {
  const warnings: Array<{ key: string; message: string }> = [];
  const duration = firstNumber(message, FIELD_SLEEP_DURATION);
  const score = firstNumber(message, FIELD_SLEEP_SCORE);

  if (duration !== null && trustedSleepDurationMinutes(duration) === null) {
    warnings.push({
      key: "sleep-duration-untrusted",
      message:
        "Sleep duration not imported; available value was missing, too short, or outside the trusted range.",
    });
  }

  if (score !== null && trustedScore(score) === null) {
    warnings.push({
      key: "sleep-score-unavailable",
      message: "Sleep score not imported; available value was unavailable.",
    });
  }

  return warnings;
}

function hrvWarnings(
  message: FitParsedMessage,
): Array<{ key: string; message: string }> {
  const warnings: Array<{ key: string; message: string }> = [];
  const hrv = firstNumber(message, FIELD_TRUSTED_OVERNIGHT_HRV);
  const status = firstValue(message, FIELD_HRV_STATUS);

  if (hrv !== null && trustedHrv(hrv) === null) {
    warnings.push({
      key: "hrv-unavailable",
      message:
        "Overnight HRV not imported; available value was unavailable or outside the trusted range.",
    });
  }

  if (status !== null && hrvStatusValue(status) === null) {
    warnings.push({
      key: "hrv-status-unavailable",
      message: "HRV status not imported; available status was unavailable.",
    });
  }

  return warnings;
}

function invalidSyntheticWarnings(
  message: FitParsedMessage,
): Array<{ key: string; message: string }> {
  return [...sleepWarnings(message), ...hrvWarnings(message)];
}

function addAccumulatorWarning(
  accumulator: WellnessAccumulator,
  key: string,
  message: string,
): void {
  if (accumulator.warningKeys.has(key)) {
    return;
  }

  accumulator.warningKeys.add(key);
  accumulator.warnings.push(message);
}

function debugNotes(messageCounts: Map<number, number>): string[] {
  if (messageCounts.size === 0) {
    return [];
  }

  const counts = [...messageCounts.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([message, count]) => `${messageName(message)}(${message})=${count}`)
    .join(", ");

  return [
    `Observed FIT message types: ${counts}.`,
    "Selection logic: steps use Garmin monitoring_info field 3 as cumulative daily steps; sleep uses trusted sleep_summary duration only; sleep-stage/segment records are ignored as totals; sleep score 0 is unavailable; resting HR uses daily_summary resting-HR fields only; overnight HRV rejects invalid sentinel values and unknown statuses.",
  ];
}

function messageName(message: number): string {
  switch (message) {
    case GLOBAL_MONITORING:
      return "monitoring";
    case GLOBAL_MONITORING_INFO:
      return "monitoring_info";
    case GLOBAL_STRESS_LEVEL:
      return "stress_level";
    case GLOBAL_SLEEP_LEVEL:
      return "sleep_level";
    case GLOBAL_SLEEP_SUMMARY:
      return "sleep_summary";
    case GLOBAL_GARMIN_SLEEP_DATA:
      return "garmin_sleep_data";
    case GLOBAL_GARMIN_SLEEP_STAGE:
      return "garmin_sleep_stage";
    case GLOBAL_HRV:
      return "hrv";
    case GLOBAL_HRV_STATUS:
      return "hrv_status";
    case GLOBAL_DAILY_SUMMARY:
      return "daily_summary";
    case GLOBAL_SYNTHETIC_WELLNESS:
      return "synthetic_wellness";
    default:
      return "message";
  }
}

function saneNumber(
  value: number | null,
  min: number,
  max: number,
): number | null {
  if (value === null || value < min || value > max) {
    return null;
  }

  return Math.round(value);
}

function roundedAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}

function maxNumber(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

function minNumber(values: number[]): number | null {
  return values.length === 0 ? null : Math.min(...values);
}

function lastNumber(values: number[]): number | null {
  return values.length === 0 ? null : values[values.length - 1];
}

function lastString(values: string[]): string | null {
  return values.length === 0 ? null : values[values.length - 1];
}

function pushNumber(values: number[], value: number | null): void {
  if (value !== null) {
    values.push(value);
  }
}

function pushString(values: string[], value: string | null): void {
  if (value !== null) {
    values.push(value);
  }
}
