import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { resolveActivityTimezone } from "../utils/timezone";
import { classifyFitContent } from "../exports/fit-classification";
import { parseGarminWellnessFit } from "./fit-wellness";
import type {
  GarminWellnessJournalField,
  GarminWellnessScanResult,
  GarminWellnessSummary,
} from "./types";
import { readFitEntriesFromZip } from "./zip-reader";
import {
  dateHintFromPath,
  isGarminSleepCsvContent,
  parseGarminSleepCsv,
} from "./sleep-csv";

const GARMIN_ROOT = "input/garmin";
const WELLNESS_ROOT = "input/garmin/wellness";
const INBOX_ROOT = "input/inbox";
const PROCESSED_ROOT = "input/processed";

interface WellnessCandidateFile {
  path: string;
}

export function scanGarminWellness(
  cwd: string,
  input: {
    date: string;
    timezone?: string | null;
    debug?: boolean;
    roots?: string[];
  },
): GarminWellnessScanResult {
  const timezone = resolveActivityTimezone(input.timezone);
  const zipSummaries = new Map<string, GarminWellnessSummary>();
  const csvSummaries = new Map<string, GarminWellnessSummary>();
  const warnings: string[] = [];
  const debugNotes: string[] = [];
  let zipFilesFound = 0;
  let looseFitFilesFound = 0;
  let sleepCsvFilesFound = 0;
  let sleepCsvRecordsRead = 0;
  let fitFilesDecoded = 0;
  let fitFilesSkipped = 0;
  let ignoredEntries = 0;

  if (timezone.warning !== null) {
    warnings.push(timezone.warning);
  }

  for (const candidate of wellnessCandidateFiles(cwd, input.roots)) {
    const extension = extname(candidate.path).toLowerCase();

    if (extension === ".zip") {
      try {
        const zip = readFitEntriesFromZip(readFileSync(candidate.path));
        const wellnessEntries = zip.fitEntries.filter(
          (entry) => classifyFitContent(entry.content) !== "activity",
        );

        if (wellnessEntries.length === 0) {
          continue;
        }

        zipFilesFound += 1;
        ignoredEntries += zip.ignoredEntries;
        warnings.push(...zip.warnings);

        for (const entry of wellnessEntries) {
          const result = parseOneFit(
            entry.content,
            entry.name,
            timezone.timeZone,
          );
          fitFilesDecoded += result.decoded;
          fitFilesSkipped += result.skipped;
          warnings.push(...result.warnings);
          debugNotes.push(...result.debugNotes);
          mergeSummaries(zipSummaries, result.summaries.map(markZipSources));
        }
      } catch (error) {
        fitFilesSkipped += 1;
        warnings.push(
          safeError(`Wellness ZIP skipped: ${basename(candidate.path)}`, error),
        );
      }
      continue;
    }

    if (extension === ".csv") {
      const content = readFileSync(candidate.path, "utf8");

      if (!isGarminSleepCsvContent(content)) {
        continue;
      }

      sleepCsvFilesFound += 1;
      const parsed = parseGarminSleepCsv(content, {
        fallbackDate: dateHintFromPath(candidate.path),
      });
      sleepCsvRecordsRead += parsed.recordsRead;
      warnings.push(...parsed.warnings);
      debugNotes.push(...parsed.debugNotes);
      mergeCsvSummaryCandidates(csvSummaries, parsed.summaries, debugNotes);
      continue;
    }

    if (extension === ".fit") {
      const content = readFileSync(candidate.path);

      if (classifyFitContent(content) === "activity") {
        continue;
      }

      looseFitFilesFound += 1;
      const result = parseOneFit(
        content,
        `loose-wellness-fit-${looseFitFilesFound}.fit`,
        timezone.timeZone,
      );
      fitFilesDecoded += result.decoded;
      fitFilesSkipped += result.skipped;
      warnings.push(...result.warnings);
      debugNotes.push(...result.debugNotes);
      mergeSummaries(zipSummaries, result.summaries.map(markZipSources));
    }
  }

  const summaries = mergeCsvAndZipSummaries(zipSummaries, csvSummaries, {
    debugNotes,
  });
  const requestedSummaries = summaries.filter(
    (summary) => summary.date === input.date,
  );

  if (input.debug === true) {
    debugNotes.push(...stepSelectionDebugNotes(input.date, requestedSummaries));
  }

  return {
    requestedDate: input.date,
    summaries: requestedSummaries,
    zipFilesFound,
    looseFitFilesFound,
    sleepCsvFilesFound,
    sleepCsvRecordsRead,
    fitFilesDecoded,
    fitFilesSkipped,
    ignoredEntries,
    warnings,
    debugNotes: input.debug === true ? unique(debugNotes) : [],
  };
}

function parseOneFit(
  content: Buffer,
  sourceFile: string,
  timeZone: string,
): {
  decoded: number;
  skipped: number;
  summaries: GarminWellnessSummary[];
  warnings: string[];
  debugNotes: string[];
} {
  try {
    const parsed = parseGarminWellnessFit(content, sourceFile, timeZone);

    if (parsed.supportedRecords === 0) {
      return {
        decoded: 1,
        skipped: 0,
        summaries: [],
        warnings: [
          "No supported wellness records found in one wellness FIT file.",
        ],
        debugNotes: parsed.debugNotes,
      };
    }

    return {
      decoded: 1,
      skipped: 0,
      summaries: parsed.summaries,
      warnings: parsed.warnings,
      debugNotes: parsed.debugNotes,
    };
  } catch (error) {
    return {
      decoded: 0,
      skipped: 1,
      summaries: [],
      warnings: [safeError("FIT wellness file skipped", error)],
      debugNotes: [],
    };
  }
}

function wellnessCandidateFiles(
  cwd: string,
  roots?: string[],
): WellnessCandidateFile[] {
  if (roots !== undefined) {
    return configuredWellnessCandidateFiles(cwd, roots);
  }

  const garminRoot = join(cwd, GARMIN_ROOT);
  const wellnessRoot = join(cwd, WELLNESS_ROOT);
  const inboxRoot = join(cwd, INBOX_ROOT);
  const processedRoot = join(cwd, PROCESSED_ROOT);
  const files = new Map<string, WellnessCandidateFile>();

  if (existsSync(wellnessRoot)) {
    for (const path of recursiveCandidateFiles(wellnessRoot, {
      zip: true,
      fit: true,
      csv: true,
    })) {
      files.set(path, {
        path,
      });
    }
  }

  if (existsSync(garminRoot)) {
    for (const entry of readdirSync(garminRoot, { withFileTypes: true })) {
      const path = join(garminRoot, entry.name);

      if (
        entry.isFile() &&
        [".zip", ".csv"].includes(extname(entry.name).toLowerCase())
      ) {
        files.set(path, { path });
        continue;
      }

      if (entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
        for (const fitPath of recursiveCandidateFiles(path, {
          zip: false,
          fit: true,
          csv: false,
        })) {
          files.set(fitPath, {
            path: fitPath,
          });
        }
      }
    }
  }

  for (const root of [inboxRoot, processedRoot]) {
    if (!existsSync(root)) {
      continue;
    }

    for (const path of recursiveCandidateFiles(root, {
      zip: true,
      fit: true,
      csv: true,
    })) {
      files.set(path, {
        path,
      });
    }
  }

  return [...files.values()];
}

function configuredWellnessCandidateFiles(
  cwd: string,
  roots: string[],
): WellnessCandidateFile[] {
  const files = new Map<string, WellnessCandidateFile>();

  for (const root of roots) {
    const absoluteRoot = join(cwd, root);

    if (!existsSync(absoluteRoot)) {
      continue;
    }

    for (const path of recursiveCandidateFiles(absoluteRoot, {
      zip: true,
      fit: true,
      csv: true,
    })) {
      files.set(path, { path });
    }
  }

  return [...files.values()];
}

function recursiveCandidateFiles(
  root: string,
  extensions: { zip: boolean; fit: boolean; csv: boolean },
): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...recursiveCandidateFiles(path, extensions));
      continue;
    }

    if (entry.isFile()) {
      const extension = extname(entry.name).toLowerCase();

      if (
        (extensions.zip && extension === ".zip") ||
        (extensions.fit && extension === ".fit") ||
        (extensions.csv && extension === ".csv")
      ) {
        files.push(path);
      }
    }
  }

  return files;
}

function mergeSummaries(
  summaries: Map<string, GarminWellnessSummary>,
  incoming: GarminWellnessSummary[],
): void {
  for (const summary of incoming) {
    const existing = summaries.get(summary.date);

    summaries.set(
      summary.date,
      existing ? mergeSummary(existing, summary) : summary,
    );
  }
}

function mergeCsvAndZipSummaries(
  zipSummaries: Map<string, GarminWellnessSummary>,
  csvSummaries: Map<string, GarminWellnessSummary>,
  output: { debugNotes: string[] },
): GarminWellnessSummary[] {
  const dates = new Set([...zipSummaries.keys(), ...csvSummaries.keys()]);
  const merged: GarminWellnessSummary[] = [];

  for (const date of dates) {
    const zip = zipSummaries.get(date) ?? null;
    const csv = csvSummaries.get(date) ?? null;

    if (zip !== null && csv !== null) {
      merged.push(mergeSummaryWithCsvPriority(zip, csv));
      output.debugNotes.push(
        "Garmin sleep CSV supplied primary sleep metrics; wellness ZIP filled non-overlapping wellness fields.",
      );
      continue;
    }

    if (csv !== null) {
      merged.push(csv);
      continue;
    }

    if (zip !== null) {
      merged.push(zip);
    }
  }

  return merged;
}

function mergeSummaryWithCsvPriority(
  zip: GarminWellnessSummary,
  csv: GarminWellnessSummary,
): GarminWellnessSummary {
  const merged: GarminWellnessSummary = {
    date: csv.date,
    totalSteps: zip.totalSteps,
    totalStepsSource: zip.totalStepsSource ?? null,
    stepCandidateCount: zip.stepCandidateCount ?? 0,
    stepRejectedCount: zip.stepRejectedCount ?? 0,
    stepRejectedReasons: zip.stepRejectedReasons ?? [],
    sleepDurationMinutes: csv.sleepDurationMinutes ?? zip.sleepDurationMinutes,
    sleepScore: csv.sleepScore ?? zip.sleepScore,
    sleepQuality: csv.sleepQuality ?? zip.sleepQuality,
    deepSleepDurationMinutes:
      csv.deepSleepDurationMinutes ?? zip.deepSleepDurationMinutes,
    lightSleepDurationMinutes:
      csv.lightSleepDurationMinutes ?? zip.lightSleepDurationMinutes,
    remDurationMinutes: csv.remDurationMinutes ?? zip.remDurationMinutes,
    awakeDurationMinutes: csv.awakeDurationMinutes ?? zip.awakeDurationMinutes,
    restlessMoments: csv.restlessMoments ?? zip.restlessMoments,
    restingHeartRate: csv.restingHeartRate ?? zip.restingHeartRate,
    averageOvernightHeartRate:
      csv.averageOvernightHeartRate ?? zip.averageOvernightHeartRate,
    overnightHrv: csv.overnightHrv ?? zip.overnightHrv,
    hrvStatus: csv.hrvStatus ?? zip.hrvStatus,
    garminStress: csv.garminStress ?? zip.garminStress,
    bodyBattery: csv.bodyBattery ?? zip.bodyBattery,
    bodyBatteryHigh: zip.bodyBatteryHigh,
    bodyBatteryLow: zip.bodyBatteryLow,
    bodyBatteryOnWaking: zip.bodyBatteryOnWaking,
    respirationRate: csv.respirationRate ?? zip.respirationRate,
    lowestRespirationRate:
      csv.lowestRespirationRate ?? zip.lowestRespirationRate,
    pulseOx: csv.pulseOx ?? zip.pulseOx,
    lowestPulseOx: csv.lowestPulseOx ?? zip.lowestPulseOx,
    breathingVariations: csv.breathingVariations ?? zip.breathingVariations,
    intensityMinutes: zip.intensityMinutes,
    floorsClimbed: zip.floorsClimbed,
    calories: zip.calories,
    bedtime: zip.bedtime,
    wakeTime: zip.wakeTime,
    sleepStages: zip.sleepStages,
    sourceFitFiles: zip.sourceFitFiles,
    supportedRecords: zip.supportedRecords + csv.supportedRecords,
    warnings: [...zip.warnings, ...csv.warnings],
    fieldSources: mergeFieldSources(zip, csv),
    lowerPriorityJournalValues: lowerPriorityValuesForCsvFields(zip, csv),
  };

  return merged;
}

function mergeFieldSources(
  zip: GarminWellnessSummary,
  csv: GarminWellnessSummary,
): GarminWellnessSummary["fieldSources"] {
  return {
    ...(zip.fieldSources ?? {}),
    ...(csv.fieldSources ?? {}),
  };
}

function lowerPriorityValuesForCsvFields(
  zip: GarminWellnessSummary,
  csv: GarminWellnessSummary,
): GarminWellnessSummary["lowerPriorityJournalValues"] {
  const zipValues = journalValues(zip);
  const csvSources = csv.fieldSources ?? {};
  const lowerPriorityValues: GarminWellnessSummary["lowerPriorityJournalValues"] =
    {};

  for (const label of Object.keys(csvSources) as GarminWellnessJournalField[]) {
    const value = zipValues[label];

    if (value !== undefined) {
      lowerPriorityValues[label] = value;
    }
  }

  return lowerPriorityValues;
}

function markZipSources(summary: GarminWellnessSummary): GarminWellnessSummary {
  return {
    ...summary,
    fieldSources: {
      ...summary.fieldSources,
      ...Object.fromEntries(
        Object.keys(journalValues(summary)).map((field) => [
          field,
          "garmin_wellness_zip",
        ]),
      ),
    },
  };
}

function mergeCsvSummaryCandidates(
  summaries: Map<string, GarminWellnessSummary>,
  incoming: GarminWellnessSummary[],
  debugNotes: string[],
): void {
  for (const summary of incoming) {
    const existing = summaries.get(summary.date);

    if (!existing) {
      summaries.set(summary.date, summary);
      continue;
    }

    const existingScore = populatedSourceCount(existing);
    const incomingScore = populatedSourceCount(summary);

    if (incomingScore > existingScore) {
      summaries.set(summary.date, summary);
    }

    debugNotes.push(
      "Multiple Garmin sleep CSV candidates existed for one wake date; the row with the most populated sleep fields was selected.",
    );
  }
}

function populatedSourceCount(summary: GarminWellnessSummary): number {
  return Object.keys(summary.fieldSources ?? {}).length;
}

function mergeSummary(
  left: GarminWellnessSummary,
  right: GarminWellnessSummary,
): GarminWellnessSummary {
  const steps = mergeStepSummary(left, right);

  return {
    date: left.date,
    totalSteps: steps.totalSteps,
    totalStepsSource: steps.totalStepsSource,
    stepCandidateCount:
      (left.stepCandidateCount ?? 0) + (right.stepCandidateCount ?? 0),
    stepRejectedCount:
      (left.stepRejectedCount ?? 0) + (right.stepRejectedCount ?? 0),
    stepRejectedReasons: unique([
      ...(left.stepRejectedReasons ?? []),
      ...(right.stepRejectedReasons ?? []),
    ]),
    sleepDurationMinutes: maxNullable(
      left.sleepDurationMinutes,
      right.sleepDurationMinutes,
    ),
    sleepScore: right.sleepScore ?? left.sleepScore,
    sleepQuality: right.sleepQuality ?? left.sleepQuality,
    deepSleepDurationMinutes: maxNullable(
      left.deepSleepDurationMinutes,
      right.deepSleepDurationMinutes,
    ),
    lightSleepDurationMinutes: maxNullable(
      left.lightSleepDurationMinutes,
      right.lightSleepDurationMinutes,
    ),
    remDurationMinutes: maxNullable(
      left.remDurationMinutes,
      right.remDurationMinutes,
    ),
    awakeDurationMinutes: maxNullable(
      left.awakeDurationMinutes,
      right.awakeDurationMinutes,
    ),
    restlessMoments: maxNullable(left.restlessMoments, right.restlessMoments),
    restingHeartRate: right.restingHeartRate ?? left.restingHeartRate,
    averageOvernightHeartRate:
      right.averageOvernightHeartRate ?? left.averageOvernightHeartRate,
    overnightHrv: right.overnightHrv ?? left.overnightHrv,
    hrvStatus: right.hrvStatus ?? left.hrvStatus,
    garminStress: right.garminStress ?? left.garminStress,
    bodyBattery: right.bodyBattery ?? left.bodyBattery,
    bodyBatteryHigh: maxNullable(left.bodyBatteryHigh, right.bodyBatteryHigh),
    bodyBatteryLow: minNullable(left.bodyBatteryLow, right.bodyBatteryLow),
    bodyBatteryOnWaking: right.bodyBatteryOnWaking ?? left.bodyBatteryOnWaking,
    respirationRate: right.respirationRate ?? left.respirationRate,
    lowestRespirationRate: minNullable(
      left.lowestRespirationRate,
      right.lowestRespirationRate,
    ),
    pulseOx: right.pulseOx ?? left.pulseOx,
    lowestPulseOx: minNullable(left.lowestPulseOx, right.lowestPulseOx),
    breathingVariations: right.breathingVariations ?? left.breathingVariations,
    intensityMinutes: maxNullable(
      left.intensityMinutes,
      right.intensityMinutes,
    ),
    floorsClimbed: maxNullable(left.floorsClimbed, right.floorsClimbed),
    calories: maxNullable(left.calories, right.calories),
    bedtime: right.bedtime ?? left.bedtime,
    wakeTime: right.wakeTime ?? left.wakeTime,
    sleepStages: right.sleepStages ?? left.sleepStages,
    sourceFitFiles: left.sourceFitFiles + right.sourceFitFiles,
    supportedRecords: left.supportedRecords + right.supportedRecords,
    warnings: [...left.warnings, ...right.warnings],
    fieldSources: {
      ...(left.fieldSources ?? {}),
      ...(right.fieldSources ?? {}),
    },
    lowerPriorityJournalValues: {
      ...(left.lowerPriorityJournalValues ?? {}),
      ...(right.lowerPriorityJournalValues ?? {}),
    },
  };
}

function mergeStepSummary(
  left: GarminWellnessSummary,
  right: GarminWellnessSummary,
): Pick<GarminWellnessSummary, "totalSteps" | "totalStepsSource"> {
  if (left.totalStepsSource === "garmin_daily_summary") {
    return {
      totalSteps: left.totalSteps,
      totalStepsSource: left.totalStepsSource,
    };
  }

  if (right.totalStepsSource === "garmin_daily_summary") {
    return {
      totalSteps: right.totalSteps,
      totalStepsSource: right.totalStepsSource,
    };
  }

  return {
    totalSteps: maxNullable(left.totalSteps, right.totalSteps),
    totalStepsSource:
      left.totalSteps !== null || right.totalSteps !== null
        ? "garmin_cumulative_snapshot"
        : "unavailable",
  };
}

function stepSelectionDebugNotes(
  requestedDate: string,
  summaries: GarminWellnessSummary[],
): string[] {
  if (summaries.length === 0) {
    return [
      `Step selection for requested date ${requestedDate}: candidate step count 0; selected source category unavailable; selected value unavailable.`,
    ];
  }

  const summary = summaries[0];
  const selectedValue =
    summary.totalSteps === null
      ? "unavailable"
      : summary.totalSteps.toLocaleString("en-US");
  const reasons = summary.stepRejectedReasons ?? [];

  return [
    `Step selection for requested date ${requestedDate}: candidate step count ${summary.stepCandidateCount ?? 0}; selected source category ${summary.totalStepsSource ?? "unavailable"}; selected value ${selectedValue}; rejected candidates ${summary.stepRejectedCount ?? 0}.`,
    ...(reasons.length === 0
      ? []
      : [
          `Step selection rejected candidate reasons: ${reasons
            .slice(0, 3)
            .join("; ")}.`,
        ]),
  ];
}

function journalValues(
  summary: GarminWellnessSummary,
): Partial<Record<GarminWellnessJournalField, string>> {
  return {
    ...(summary.sleepQuality === null ? {} : { Sleep: summary.sleepQuality }),
    ...(summary.sleepDurationMinutes === null
      ? {}
      : {
          "Sleep Duration": formatSleepDuration(summary.sleepDurationMinutes),
        }),
    ...(summary.sleepScore === null
      ? {}
      : { "Sleep Score": String(summary.sleepScore) }),
    ...(summary.deepSleepDurationMinutes === null
      ? {}
      : {
          "Deep Sleep Duration": formatSleepDuration(
            summary.deepSleepDurationMinutes,
          ),
        }),
    ...(summary.lightSleepDurationMinutes === null
      ? {}
      : {
          "Light Sleep Duration": formatSleepDuration(
            summary.lightSleepDurationMinutes,
          ),
        }),
    ...(summary.remDurationMinutes === null
      ? {}
      : { "REM Duration": formatSleepDuration(summary.remDurationMinutes) }),
    ...(summary.awakeDurationMinutes === null
      ? {}
      : {
          "Awake Duration": formatSleepDuration(summary.awakeDurationMinutes),
        }),
    ...(summary.restlessMoments === null
      ? {}
      : { "Restless Moments": String(summary.restlessMoments) }),
    ...(summary.restingHeartRate === null
      ? {}
      : { "Resting Heart Rate": `${summary.restingHeartRate} bpm` }),
    ...(summary.averageOvernightHeartRate === null
      ? {}
      : {
          "Average Overnight Heart Rate": `${summary.averageOvernightHeartRate} bpm`,
        }),
    ...(summary.overnightHrv === null
      ? {}
      : { "Overnight HRV": `${summary.overnightHrv} ms` }),
    ...(summary.hrvStatus === null ? {} : { "HRV Status": summary.hrvStatus }),
    ...(summary.garminStress === null
      ? {}
      : { "Garmin Stress": String(summary.garminStress) }),
    ...(summary.bodyBattery === null
      ? {}
      : { "Body Battery": summary.bodyBattery }),
    ...(summary.respirationRate === null
      ? {}
      : { "Average Respiration": String(summary.respirationRate) }),
    ...(summary.lowestRespirationRate === null
      ? {}
      : { "Lowest Respiration": String(summary.lowestRespirationRate) }),
    ...(summary.pulseOx === null
      ? {}
      : { "Average SpO2": `${summary.pulseOx}%` }),
    ...(summary.lowestPulseOx === null
      ? {}
      : { "Lowest SpO2": `${summary.lowestPulseOx}%` }),
    ...(summary.breathingVariations === null
      ? {}
      : { "Breathing Variations": summary.breathingVariations }),
    ...(summary.totalSteps === null
      ? {}
      : { "Total Steps": summary.totalSteps.toLocaleString("en-US") }),
  };
}

function formatSleepDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;

  return `${hours}h ${remainingMinutes}m`;
}

function maxNullable(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }

  if (right === null) {
    return left;
  }

  return Math.max(left, right);
}

function minNullable(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }

  if (right === null) {
    return left;
  }

  return Math.min(left, right);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function safeError(prefix: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return `${prefix}. ${message}`;
}
