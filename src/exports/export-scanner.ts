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

const SUPPORTED_EXTENSIONS = new Set([".csv", ".tcx", ".gpx", ".json", ".fit"]);

const EXPORT_FOLDERS: Array<{
  relativePath: string;
  source: "garmin_export" | "strava_export";
}> = [
  { relativePath: "input/garmin", source: "garmin_export" },
  { relativePath: "input/strava", source: "strava_export" },
];

export function scanExportFiles(cwd = process.cwd()): ExportScanResult {
  const files: ExportFileInfo[] = [];
  const warnings: ExportParseWarning[] = [];

  for (const folder of EXPORT_FOLDERS) {
    const absoluteFolder = join(cwd, folder.relativePath);

    if (!existsSync(absoluteFolder)) {
      warnings.push({
        source: folder.source,
        message: `${folder.relativePath} is missing; no local exports scanned.`,
      });
      continue;
    }

    for (const absolutePath of walkFiles(absoluteFolder)) {
      const relativePath = normalizePath(relative(cwd, absolutePath));
      const extension = extname(absolutePath).toLowerCase();

      if (relativePath.endsWith("/.gitkeep")) {
        continue;
      }

      if (
        isRecognizedGarminWellnessZip(relativePath, folder.source, extension)
      ) {
        continue;
      }

      const supported = SUPPORTED_EXTENSIONS.has(extension);
      files.push({
        relativePath,
        source: folder.source,
        extension: extension || "(none)",
        supported,
      });

      if (!supported) {
        warnings.push({
          source: folder.source,
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
  options: { timezone?: string | null } = {},
): ExportParseResult {
  const scan = scanExportFiles(cwd);
  const activities: ManualActivity[] = [];
  const warnings = [...scan.warnings];
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

function isRecognizedGarminWellnessZip(
  relativePath: string,
  source: ExportSource,
  extension: string,
): boolean {
  if (source !== "garmin_export" || extension !== ".zip") {
    return false;
  }

  const pathAfterGarmin = relativePath.replace(/^input\/garmin\//, "");

  return (
    !pathAfterGarmin.includes("/") || pathAfterGarmin.startsWith("wellness/")
  );
}

function parseExportContent(input: {
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
