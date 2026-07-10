import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
} from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { loadAthleteConfig } from "../config/load";
import { classifyFitContent } from "../exports/fit-classification";
import {
  parseLocalExports,
  parseScannedExportFiles,
} from "../exports/export-scanner";
import { parseGarminCsvCompanion } from "../exports/garmin-csv-companion";
import { importGarminWellness } from "../garmin-wellness/importer";
import { isGarminSleepCsvContent } from "../garmin-wellness/sleep-csv";
import { readFitEntriesFromZip } from "../garmin-wellness/zip-reader";
import { analyzeActivityDuplicates } from "../generator/duplicate-detection";
import type {
  ExportFileInfo,
  ExportParseWarning,
  ExportScanResult,
  ManualActivity,
} from "../types";
import { parseDate } from "../utils/dates";

const INBOX_ROOT = "input/inbox";
const PROCESSED_ROOT = "input/processed";
const SUPPORTED_ACTIVITY_EXTENSIONS = new Set([
  ".csv",
  ".tcx",
  ".gpx",
  ".json",
  ".fit",
  ".zip",
]);

interface InboxClassification {
  scan: ExportScanResult;
  processedFiles: string[];
  filesScanned: number;
  garminActivityFileCandidates: number;
  stravaFileCandidates: number;
  wellnessFileCandidates: number;
  sleepCsvFileCandidates: number;
  warnings: string[];
}

export interface IngestResult {
  evidenceDate: string;
  filesScanned: number;
  activitiesParsed: number;
  garminActivityFilesParsed: number;
  stravaFilesParsed: number;
  wellnessZipFilesParsed: number;
  sleepCsvRecordsParsed: number;
  journalCreated: boolean;
  journalUpdated: boolean;
  fieldsPopulated: string[];
  fieldsPreserved: string[];
  duplicateWarnings: string[];
  warnings: string[];
  debugNotes: string[];
  archivedFiles: number;
  archiveSkipped: boolean;
  coachOutput?: string;
}

export function ingestInbox(input: {
  cwd: string;
  date: string;
  debug?: boolean;
  archive?: boolean;
}): IngestResult {
  parseDate(input.date);

  const { config } = loadAthleteConfig(input.cwd);
  const classification = classifyInbox(input.cwd);
  const inboxExports = parseScannedExportFiles(input.cwd, classification.scan, {
    timezone: config.timezone,
  });
  const allExports = parseLocalExports(input.cwd, {
    timezone: config.timezone,
  });
  const activitiesForDate = allExports.activities.filter(
    (activity) => activity.date === input.date,
  );
  const wellness = importGarminWellness({
    cwd: input.cwd,
    date: input.date,
    timezone: config.timezone,
    importedActivities: allExports.activities,
    debug: input.debug,
  });
  const duplicateAnalysis = analyzeActivityDuplicates(activitiesForDate);
  const warnings = unique([
    ...classification.warnings,
    ...inboxExports.warnings.map((warning) => warning.message),
    ...allExports.warnings.map((warning) => warning.message),
    ...wellness.warnings,
  ]);
  const archiveStatus =
    input.archive === true
      ? archiveProcessedFiles({
          cwd: input.cwd,
          date: input.date,
          relativePaths: classification.processedFiles,
          warnings: unique([
            ...classification.warnings,
            ...inboxExports.warnings.map((warning) => warning.message),
          ]),
        })
      : { archivedFiles: 0, skipped: false, warnings: [] };

  return {
    evidenceDate: input.date,
    filesScanned: classification.filesScanned,
    activitiesParsed: activitiesForDate.length,
    garminActivityFilesParsed: parsedFileCountForSource(
      classification.scan.files,
      "garmin_export",
    ),
    stravaFilesParsed: parsedFileCountForSource(
      classification.scan.files,
      "strava_export",
    ),
    wellnessZipFilesParsed: wellness.zipFilesFound,
    sleepCsvRecordsParsed: wellness.sleepCsvRecordsRead,
    journalCreated: wellness.journalCreated,
    journalUpdated: wellness.journalUpdated,
    fieldsPopulated: wellness.fieldsPopulated,
    fieldsPreserved: wellness.fieldsPreserved,
    duplicateWarnings: duplicateAnalysis.warnings.map(
      (warning) => warning.message,
    ),
    warnings: unique([...warnings, ...archiveStatus.warnings]),
    debugNotes:
      input.debug === true
        ? privacySafeDebugNotes({
            activities: activitiesForDate,
            wellnessDebugNotes: wellness.debugNotes,
            classification,
            duplicateWarnings: duplicateAnalysis.warnings.map(
              (warning) => warning.message,
            ),
          })
        : [],
    archivedFiles: archiveStatus.archivedFiles,
    archiveSkipped: archiveStatus.skipped,
  };
}

export function formatIngestReport(result: IngestResult): string {
  return [
    "Garmin/Strava ingest",
    "",
    `Evidence date: ${result.evidenceDate}`,
    "",
    `Files scanned: ${result.filesScanned}`,
    `Activities parsed: ${result.activitiesParsed}`,
    `Garmin activity files parsed: ${result.garminActivityFilesParsed}`,
    `Strava files parsed: ${result.stravaFilesParsed}`,
    `Wellness ZIPs parsed: ${result.wellnessZipFilesParsed}`,
    `Sleep CSV records parsed: ${result.sleepCsvRecordsParsed}`,
    `Journal created: ${yesNo(result.journalCreated)}`,
    `Journal updated: ${yesNo(result.journalUpdated)}`,
    "",
    "Fields populated:",
    ...formatList(result.fieldsPopulated),
    "",
    "Manual journal fields preserved:",
    ...formatList(result.fieldsPreserved),
    "",
    "Activity dedupe summary:",
    ...formatList(result.duplicateWarnings),
    "",
    "Warnings:",
    ...formatList(result.warnings),
    ...(result.archivedFiles > 0 || result.archiveSkipped
      ? [
          "",
          `Archive: ${
            result.archiveSkipped
              ? "skipped because ingest had warnings or no supported files were eligible"
              : `${result.archivedFiles} processed file(s) moved to input/processed/${result.evidenceDate}/`
          }`,
        ]
      : []),
    ...(result.debugNotes.length === 0
      ? []
      : ["", "Debug notes:", ...formatList(result.debugNotes)]),
    "",
    "Next:",
    `npm run coach -- --evidence-date ${result.evidenceDate}`,
    result.coachOutput ? ["", result.coachOutput].join("\n") : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function classifyInbox(cwd: string): InboxClassification {
  const inboxRoot = join(cwd, INBOX_ROOT);
  const warnings: string[] = [];
  const files: ExportFileInfo[] = [];
  const processedFiles: string[] = [];
  let garminActivityFileCandidates = 0;
  let stravaFileCandidates = 0;
  let wellnessFileCandidates = 0;
  let sleepCsvFileCandidates = 0;

  if (!existsSync(inboxRoot)) {
    return {
      scan: { files, warnings: [] },
      processedFiles,
      filesScanned: 0,
      garminActivityFileCandidates,
      stravaFileCandidates,
      wellnessFileCandidates,
      sleepCsvFileCandidates,
      warnings: [`${INBOX_ROOT} is missing; no inbox files scanned.`],
    };
  }

  const absoluteFiles = walkFiles(inboxRoot).filter(
    (file) => !file.endsWith(".gitkeep"),
  );

  for (const absolutePath of absoluteFiles) {
    const relativePath = normalizePath(relative(cwd, absolutePath));
    const extension = extname(absolutePath).toLowerCase() || "(none)";

    if (!SUPPORTED_ACTIVITY_EXTENSIONS.has(extension)) {
      warnings.push(
        `Unsupported inbox file type skipped: ${extension}. File left in inbox.`,
      );
      continue;
    }

    const content = readFileSync(absolutePath);
    const classification = classifyInboxFile(content, extension);

    if (classification.kind === "unsupported") {
      warnings.push(classification.warning);
      continue;
    }

    processedFiles.push(relativePath);

    if (classification.kind === "wellness_zip") {
      wellnessFileCandidates += 1;
      continue;
    }

    if (classification.kind === "wellness_fit") {
      wellnessFileCandidates += 1;
      continue;
    }

    if (classification.kind === "sleep_csv") {
      sleepCsvFileCandidates += 1;
      continue;
    }

    if (classification.kind !== "activity") {
      continue;
    }

    const file: ExportFileInfo = {
      relativePath,
      source: classification.source,
      extension,
      supported: true,
    };
    files.push(file);

    if (classification.source === "garmin_export") {
      garminActivityFileCandidates += 1;
    } else {
      stravaFileCandidates += 1;
    }
  }

  const scanWarnings: ExportParseWarning[] = warnings.map((message) => ({
    source: "unknown",
    message,
  }));

  return {
    scan: { files, warnings: scanWarnings },
    processedFiles,
    filesScanned: absoluteFiles.length,
    garminActivityFileCandidates,
    stravaFileCandidates,
    wellnessFileCandidates,
    sleepCsvFileCandidates,
    warnings,
  };
}

function classifyInboxFile(
  content: Buffer,
  extension: string,
):
  | { kind: "activity"; source: "garmin_export" | "strava_export" }
  | { kind: "wellness_zip" | "wellness_fit" | "sleep_csv" }
  | { kind: "unsupported"; warning: string } {
  if (extension === ".fit") {
    const fitKind = classifyFitContent(content);

    if (fitKind === "activity") {
      return { kind: "activity", source: "garmin_export" };
    }

    if (fitKind === "wellness") {
      return { kind: "wellness_fit" };
    }

    return {
      kind: "unsupported",
      warning: "FIT inbox file could not be classified safely; left in inbox.",
    };
  }

  if (extension === ".zip") {
    try {
      const zip = readFitEntriesFromZip(content);
      const fitKinds = zip.fitEntries.map((entry) =>
        classifyFitContent(entry.content),
      );

      if (fitKinds.some((kind) => kind === "activity")) {
        return { kind: "activity", source: "garmin_export" };
      }

      if (fitKinds.some((kind) => kind === "wellness")) {
        return { kind: "wellness_zip" };
      }
    } catch {
      return {
        kind: "unsupported",
        warning: "ZIP inbox file could not be inspected safely; left in inbox.",
      };
    }

    return {
      kind: "unsupported",
      warning:
        "ZIP inbox file did not contain supported activity or wellness FIT data; left in inbox.",
    };
  }

  if (extension === ".csv") {
    const text = content.toString("utf8");

    if (isGarminSleepCsvContent(text)) {
      return { kind: "sleep_csv" };
    }

    if (parseGarminCsvCompanion(text) !== null) {
      return { kind: "activity", source: "garmin_export" };
    }

    return {
      kind: "activity",
      source: inferCsvSource(text),
    };
  }

  if (extension === ".gpx" || extension === ".tcx" || extension === ".json") {
    return { kind: "activity", source: "strava_export" };
  }

  return {
    kind: "unsupported",
    warning: `Unsupported inbox file type skipped: ${extension}. File left in inbox.`,
  };
}

function inferCsvSource(content: string): "garmin_export" | "strava_export" {
  const firstLine = content.split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";

  if (
    firstLine.includes("activity date") ||
    firstLine.includes("activity type") ||
    firstLine.includes("begintimestamp")
  ) {
    return "garmin_export";
  }

  return "strava_export";
}

function archiveProcessedFiles(input: {
  cwd: string;
  date: string;
  relativePaths: string[];
  warnings: string[];
}): { archivedFiles: number; skipped: boolean; warnings: string[] } {
  const uniqueRelativePaths = unique(input.relativePaths);

  if (uniqueRelativePaths.length === 0 || hasParseFailure(input.warnings)) {
    return {
      archivedFiles: 0,
      skipped: true,
      warnings:
        uniqueRelativePaths.length === 0
          ? []
          : [
              "Archive skipped because one or more supported inbox files produced ingest warnings.",
            ],
    };
  }

  const archiveRoot = join(input.cwd, PROCESSED_ROOT, input.date);
  mkdirSync(archiveRoot, { recursive: true });
  let archivedFiles = 0;
  const warnings: string[] = [];

  for (const relativePath of uniqueRelativePaths) {
    const source = join(input.cwd, relativePath);

    if (!existsSync(source)) {
      continue;
    }

    const destination = uniqueDestination(archiveRoot, basename(relativePath));

    if (destination === null) {
      warnings.push(
        "One processed inbox file could not be archived without overwriting an existing file; left in inbox.",
      );
      continue;
    }

    mkdirSync(dirname(destination), { recursive: true });
    renameSync(source, destination);
    archivedFiles += 1;
  }

  return {
    archivedFiles,
    skipped: false,
    warnings,
  };
}

function uniqueDestination(root: string, fileName: string): string | null {
  const parsed = splitFileName(fileName);

  for (let index = 0; index < 1000; index += 1) {
    const candidateName =
      index === 0
        ? fileName
        : `${parsed.base}-${String(index + 1).padStart(3, "0")}${parsed.extension}`;
    const candidate = join(root, candidateName);

    if (!existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function splitFileName(fileName: string): { base: string; extension: string } {
  const extension = extname(fileName);

  return {
    base: extension === "" ? fileName : fileName.slice(0, -extension.length),
    extension,
  };
}

function parsedFileCountForSource(
  files: ExportFileInfo[],
  source: "garmin_export" | "strava_export",
): number {
  return files.filter((file) => file.source === source && file.supported)
    .length;
}

function privacySafeDebugNotes(input: {
  activities: ManualActivity[];
  wellnessDebugNotes: string[];
  classification: InboxClassification;
  duplicateWarnings: string[];
}): string[] {
  return [
    `Inbox classification: Garmin activity candidates ${input.classification.garminActivityFileCandidates}; Strava candidates ${input.classification.stravaFileCandidates}; wellness candidates ${input.classification.wellnessFileCandidates}; sleep CSV candidates ${input.classification.sleepCsvFileCandidates}.`,
    ...input.activities.map(
      (activity) =>
        `Activity selected: ${activity.activityType}; source category ${activity.source}; evidence date ${activity.date}.`,
    ),
    ...input.wellnessDebugNotes.filter(isConciseWellnessDebugNote),
    ...input.duplicateWarnings.map(
      (warning) => `Duplicate handling: ${warning}`,
    ),
  ];
}

function isConciseWellnessDebugNote(note: string): boolean {
  return (
    note.startsWith("Step selection for requested date") ||
    note.startsWith("Step winner:") ||
    note.includes("Garmin sleep CSV supplied primary sleep metrics")
  );
}

function hasParseFailure(warnings: string[]): boolean {
  return warnings.some((warning) =>
    /could not be parsed|could not be inspected|skipped|unsafe entry path/i.test(
      warning,
    ),
  );
}

function walkFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(absolutePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function formatList(values: string[]): string[] {
  return values.length === 0 ? ["- none"] : values.map((value) => `- ${value}`);
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
