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
}

export interface FitWellnessParseResult {
  summaries: GarminWellnessSummary[];
  supportedRecords: number;
  warnings: string[];
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

const FIELD_STEPS = [3, 10, 24, 100];
const FIELD_SLEEP_DURATION = [1, 10, 101];
const FIELD_SLEEP_SCORE = [2, 11, 102];
const FIELD_RESTING_HR = [3, 13, 103];
const FIELD_OVERNIGHT_HRV = [4, 0, 104];
const FIELD_HRV_STATUS = [5, 15, 105];
const FIELD_GARMIN_STRESS = [6, 0, 106];
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
  let supportedRecords = 0;

  for (const message of messages) {
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
  }

  return {
    summaries: [...byDate.values()].map(summaryFromAccumulator),
    supportedRecords,
    warnings,
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
    })
  | null {
  const timestamp = timestampFromMessage(message);
  const date = toAthleteLocalDate(timestamp, timeZone);

  if (date === null) {
    return null;
  }

  switch (message.globalMessageNumber) {
    case GLOBAL_MONITORING:
    case GLOBAL_MONITORING_INFO:
    case GLOBAL_DAILY_SUMMARY:
    case GLOBAL_SYNTHETIC_WELLNESS:
      return {
        date,
        totalSteps: saneNumber(firstNumber(message, FIELD_STEPS), 0, 200000),
        sleepDurationMinutes: scaledDurationMinutes(
          firstNumber(message, FIELD_SLEEP_DURATION),
        ),
        sleepScore: saneNumber(firstNumber(message, FIELD_SLEEP_SCORE), 0, 100),
        restingHeartRate: saneNumber(
          firstNumber(message, FIELD_RESTING_HR),
          25,
          120,
        ),
        overnightHrv: saneNumber(
          firstNumber(message, FIELD_OVERNIGHT_HRV),
          1,
          300,
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
      };
    case GLOBAL_SLEEP_SUMMARY:
    case GLOBAL_SLEEP_LEVEL:
      return {
        date,
        totalSteps: null,
        sleepDurationMinutes: scaledDurationMinutes(
          firstNumber(message, FIELD_SLEEP_DURATION),
        ),
        sleepScore: saneNumber(firstNumber(message, FIELD_SLEEP_SCORE), 0, 100),
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
        bedtime: localTimeFromField(message, FIELD_BEDTIME, timeZone),
        wakeTime: localTimeFromField(message, FIELD_WAKE_TIME, timeZone),
        sleepStages: valueString(firstValue(message, FIELD_SLEEP_STAGE)),
        bodyBatteryValues: [],
      };
    case GLOBAL_HRV:
    case GLOBAL_HRV_STATUS:
      return {
        date,
        totalSteps: null,
        sleepDurationMinutes: null,
        sleepScore: null,
        restingHeartRate: null,
        overnightHrv: saneNumber(
          firstNumber(message, FIELD_OVERNIGHT_HRV),
          1,
          300,
        ),
        hrvStatus: hrvStatusValue(firstValue(message, FIELD_HRV_STATUS)),
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
      };
    case GLOBAL_STRESS_LEVEL:
      return {
        date,
        totalSteps: null,
        sleepDurationMinutes: null,
        sleepScore: null,
        restingHeartRate: null,
        overnightHrv: null,
        hrvStatus: null,
        garminStress: saneNumber(
          firstNumber(message, FIELD_GARMIN_STRESS),
          0,
          100,
        ),
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
        bodyBatteryValues: bodyBatteryValues(message),
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
  };
  byDate.set(date, created);

  return created;
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

  if (text !== null) {
    return text;
  }

  const number = valueNumber(value);

  switch (number) {
    case 0:
      return "unknown";
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
