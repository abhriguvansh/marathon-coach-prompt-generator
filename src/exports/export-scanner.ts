import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import type {
  ExportFileInfo,
  ExportParseResult,
  ExportParseWarning,
  ExportScanResult,
  ExportSource,
  ManualActivity,
} from "../types";
import { parseCsvExport } from "./parse-csv-export";
import { parseFitExport } from "./parse-fit-export";
import { parseGpxExport } from "./parse-gpx-export";
import { parseJsonExport } from "./parse-json-export";
import { parseTcxExport } from "./parse-tcx-export";
import { resolveActivityTimezone } from "../utils/timezone";
import { classifyFitContent } from "./fit-classification";
import {
  applyGarminCsvCompanions,
  parseGarminCsvCompanion,
  type GarminCsvCompanion,
} from "./garmin-csv-companion";
import { readFitEntriesFromZip } from "../garmin-wellness/zip-reader";
import { isGarminSleepCsvContent } from "../garmin-wellness/sleep-csv";

const SUPPORTED_EXTENSIONS = new Set([
  ".csv",
  ".tcx",
  ".gpx",
  ".json",
  ".fit",
  ".zip",
]);

const EXPORT_FOLDERS: Array<{
  relativePath: string;
  source: "garmin_export" | "strava_export";
  optional?: boolean;
}> = [
  { relativePath: "input/garmin", source: "garmin_export" },
  { relativePath: "input/strava", source: "strava_export" },
  { relativePath: "input/inbox", source: "garmin_export", optional: true },
  {
    relativePath: "input/processed",
    source: "garmin_export",
    optional: true,
  },
];

interface ExportFolder {
  relativePath: string;
  source: "garmin_export" | "strava_export";
  optional?: boolean;
}

export function scanExportFiles(
  cwd = process.cwd(),
  options: { folders?: ExportFolder[] } = {},
): ExportScanResult {
  const files: ExportFileInfo[] = [];
  const warnings: ExportParseWarning[] = [];

  for (const folder of options.folders ?? EXPORT_FOLDERS) {
    const absoluteFolder = join(cwd, folder.relativePath);

    if (!existsSync(absoluteFolder)) {
      if (folder.optional === true) {
        continue;
      }

      warnings.push({
        source: folder.source,
        message: `${folder.relativePath} is missing; no local exports scanned.`,
      });
      continue;
    }

    for (const absolutePath of walkFiles(absoluteFolder)) {
      const relativePath = normalizePath(relative(cwd, absolutePath));
      const extension = extname(absolutePath).toLowerCase();
      const source = sourceForFolderFile(folder, absolutePath, extension);

      if (relativePath.endsWith("/.gitkeep")) {
        continue;
      }

      if (shouldSkipGarminFitFile(absolutePath, source, extension)) {
        continue;
      }

      if (shouldSkipGarminWellnessZip(absolutePath, source, extension)) {
        continue;
      }

      const supported =
        SUPPORTED_EXTENSIONS.has(extension) &&
        (extension !== ".zip" || source === "garmin_export");
      files.push({
        relativePath,
        source,
        extension: extension || "(none)",
        supported,
      });

      if (!supported) {
        warnings.push({
          source,
          extension: extension || "(none)",
          message: `Unsupported export file type skipped: ${extension || "(none)"}.`,
        });
      }
    }
  }

  return { files, warnings };
}

export function parseLocalExports(
  cwd = process.cwd(),
  options: { timezone?: string | null; folders?: ExportFolder[] } = {},
): ExportParseResult {
  const scan = scanExportFiles(cwd, { folders: options.folders });

  return parseScannedExportFiles(cwd, scan, {
    timezone: options.timezone,
  });
}

export function parseScannedExportFiles(
  cwd: string,
  scan: ExportScanResult,
  options: { timezone?: string | null } = {},
): ExportParseResult {
  const activities: ManualActivity[] = [];
  const warnings = [...scan.warnings];
  const garminCsvCompanions: GarminCsvCompanion[] = [];
  const timezone = resolveActivityTimezone(options.timezone);

  if (
    timezone.warning !== null &&
    scan.files.some((candidate) => candidate.supported)
  ) {
    warnings.push({
      source: "unknown",
      message: timezone.warning,
    });
  }

  for (const file of scan.files.filter((candidate) => candidate.supported)) {
    const absolutePath = join(cwd, file.relativePath);

    try {
      const content = readFileSync(absolutePath);

      if (file.source === "garmin_export" && file.extension === ".csv") {
        if (isGarminSleepCsvContent(content.toString("utf8"))) {
          continue;
        }

        const companion = parseGarminCsvCompanion(content.toString("utf8"));

        if (companion) {
          garminCsvCompanions.push(companion);
          continue;
        }
      }

      const parsed = parseExportContent({
        content,
        extension: file.extension,
        source: file.source,
        timeZone: timezone.timeZone,
      });

      activities.push(...parsed.activities);
      warnings.push(...parsed.warnings);
    } catch {
      warnings.push({
        source: file.source,
        extension: file.extension,
        message:
          file.extension === ".fit"
            ? `FIT file could not be parsed: ${file.relativePath}. Skipping file.`
            : `Could not parse one ${file.extension} export file; skipped safely.`,
      });
    }
  }

  warnings.push(...applyGarminCsvCompanions(activities, garminCsvCompanions));

  return { activities, scan, warnings };
}

export function summarizeExportScan(scan: ExportScanResult): string {
  const garminFiles = scan.files.filter(
    (file) => file.source === "garmin_export",
  );
  const stravaFiles = scan.files.filter(
    (file) => file.source === "strava_export",
  );
  const supportedTypes = unique(
    scan.files.filter((file) => file.supported).map((file) => file.extension),
  );
  const unsupportedTypes = unique(
    scan.files.filter((file) => !file.supported).map((file) => file.extension),
  );

  return [
    `Garmin export files found: ${garminFiles.length}`,
    `Strava export files found: ${stravaFiles.length}`,
    `Supported file types detected: ${supportedTypes.length === 0 ? "none" : supportedTypes.join(", ")}`,
    `Unsupported file types detected: ${unsupportedTypes.length === 0 ? "none" : unsupportedTypes.join(", ")}`,
    `Warnings: ${scan.warnings.length}`,
  ].join("\n");
}

function shouldSkipGarminFitFile(
  absolutePath: string,
  source: ExportSource,
  extension: string,
): boolean {
  if (source !== "garmin_export" || extension !== ".fit") {
    return false;
  }

  return classifyFitContent(readFileSync(absolutePath)) === "wellness";
}

function sourceForFolderFile(
  folder: ExportFolder,
  absolutePath: string,
  extension: string,
): "garmin_export" | "strava_export" {
  if (!["input/inbox", "input/processed"].includes(folder.relativePath)) {
    return folder.source;
  }

  if ([".gpx", ".tcx", ".json"].includes(extension)) {
    return "strava_export";
  }

  if (extension === ".csv") {
    const content = readFileSync(absolutePath, "utf8");

    if (
      isGarminSleepCsvContent(content) ||
      parseGarminCsvCompanion(content) !== null
    ) {
      return "garmin_export";
    }

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

  return "garmin_export";
}

function shouldSkipGarminWellnessZip(
  absolutePath: string,
  source: ExportSource,
  extension: string,
): boolean {
  if (source !== "garmin_export" || extension !== ".zip") {
    return false;
  }

  try {
    const zip = readFitEntriesFromZip(readFileSync(absolutePath));

    return !zip.fitEntries.some(
      (entry) => classifyFitContent(entry.content) === "activity",
    );
  } catch {
    return false;
  }
}

export function parseExportContent(input: {
  content: Buffer;
  extension: string;
  source: ExportSource;
  timeZone: string;
}): { activities: ManualActivity[]; warnings: ExportParseWarning[] } {
  switch (input.extension) {
    case ".csv":
      return parseCsvExport(input.content.toString("utf8"), input.source, {
        timeZone: input.timeZone,
      });
    case ".fit":
      return parseFitExport(input.content, input.source, {
        timeZone: input.timeZone,
      });
    case ".zip":
      return parseGarminZipExport(input.content, input.source, {
        timeZone: input.timeZone,
      });
    case ".tcx":
      return parseTcxExport(input.content.toString("utf8"), input.source, {
        timeZone: input.timeZone,
      });
    case ".gpx":
      return parseGpxExport(input.content.toString("utf8"), input.source, {
        timeZone: input.timeZone,
      });
    case ".json":
      return parseJsonExport(input.content.toString("utf8"), input.source, {
        timeZone: input.timeZone,
      });
    default:
      return {
        activities: [],
        warnings: [
          {
            source: input.source,
            extension: input.extension,
            message: `Unsupported export file type skipped: ${input.extension}.`,
          },
        ],
      };
  }
}

function parseGarminZipExport(
  content: Buffer,
  source: ExportSource,
  options: { timeZone: string },
): { activities: ManualActivity[]; warnings: ExportParseWarning[] } {
  if (source !== "garmin_export") {
    return {
      activities: [],
      warnings: [
        {
          source,
          extension: ".zip",
          message:
            "ZIP export skipped; only Garmin activity ZIPs are supported.",
        },
      ],
    };
  }

  const zip = readFitEntriesFromZip(content);
  const activities: ManualActivity[] = [];
  const warnings: ExportParseWarning[] = zip.warnings.map((message) => ({
    source,
    extension: ".zip",
    message,
  }));
  let activityFitEntries = 0;

  for (const entry of zip.fitEntries) {
    if (classifyFitContent(entry.content) !== "activity") {
      continue;
    }

    activityFitEntries += 1;
    const parsed = parseFitExport(entry.content, source, {
      timeZone: options.timeZone,
    });
    activities.push(...parsed.activities);
    warnings.push(...parsed.warnings);
  }

  if (activityFitEntries === 0) {
    warnings.push({
      source,
      extension: ".zip",
      message:
        "Garmin ZIP parsed but no activity FIT entries were found; wellness entries are handled by import:wellness.",
    });
  }

  return { activities, warnings };
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

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
