import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { resolveActivityTimezone } from "../utils/timezone";
import { classifyFitContent } from "../exports/fit-classification";
import { parseGarminWellnessFit } from "./fit-wellness";
import type { GarminWellnessScanResult, GarminWellnessSummary } from "./types";
import { readFitEntriesFromZip } from "./zip-reader";

const GARMIN_ROOT = "input/garmin";
const WELLNESS_ROOT = "input/garmin/wellness";

interface WellnessCandidateFile {
  path: string;
}

export function scanGarminWellness(
  cwd: string,
  input: { date: string; timezone?: string | null; debug?: boolean },
): GarminWellnessScanResult {
  const timezone = resolveActivityTimezone(input.timezone);
  const summaries = new Map<string, GarminWellnessSummary>();
  const warnings: string[] = [];
  const debugNotes: string[] = [];
  let zipFilesFound = 0;
  let looseFitFilesFound = 0;
  let fitFilesDecoded = 0;
  let fitFilesSkipped = 0;
  let ignoredEntries = 0;

  if (timezone.warning !== null) {
    warnings.push(timezone.warning);
  }

  for (const candidate of wellnessCandidateFiles(cwd)) {
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
          mergeSummaries(summaries, result.summaries);
        }
      } catch (error) {
        fitFilesSkipped += 1;
        warnings.push(
          safeError(`Wellness ZIP skipped: ${basename(candidate.path)}`, error),
        );
      }
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
      mergeSummaries(summaries, result.summaries);
    }
  }

  return {
    requestedDate: input.date,
    summaries: [...summaries.values()].filter(
      (summary) => summary.date === input.date,
    ),
    zipFilesFound,
    looseFitFilesFound,
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

function wellnessCandidateFiles(cwd: string): WellnessCandidateFile[] {
  const garminRoot = join(cwd, GARMIN_ROOT);
  const wellnessRoot = join(cwd, WELLNESS_ROOT);
  const files = new Map<string, WellnessCandidateFile>();

  if (existsSync(wellnessRoot)) {
    for (const path of recursiveCandidateFiles(wellnessRoot, {
      zip: true,
      fit: true,
    })) {
      files.set(path, {
        path,
      });
    }
  }

  if (existsSync(garminRoot)) {
    for (const entry of readdirSync(garminRoot, { withFileTypes: true })) {
      const path = join(garminRoot, entry.name);

      if (entry.isFile() && extname(entry.name).toLowerCase() === ".zip") {
        files.set(path, { path });
        continue;
      }

      if (entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
        for (const fitPath of recursiveCandidateFiles(path, {
          zip: false,
          fit: true,
        })) {
          files.set(fitPath, {
            path: fitPath,
          });
        }
      }
    }
  }

  return [...files.values()];
}

function recursiveCandidateFiles(
  root: string,
  extensions: { zip: boolean; fit: boolean },
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
        (extensions.fit && extension === ".fit")
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

function mergeSummary(
  left: GarminWellnessSummary,
  right: GarminWellnessSummary,
): GarminWellnessSummary {
  return {
    date: left.date,
    totalSteps: maxNullable(left.totalSteps, right.totalSteps),
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
  };
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
