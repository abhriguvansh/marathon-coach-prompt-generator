import { relative } from "node:path";
import { parseLocalExports } from "../exports/export-scanner";
import { scanGarminWellness } from "./scanner";
import type { GarminWellnessImportResult } from "./types";
import { updateJournalWithGarminWellness } from "./journal-updater";
import type { ManualActivity } from "../types";

export function importGarminWellness(input: {
  cwd: string;
  date: string;
  timezone?: string | null;
  debug?: boolean;
  importedActivities?: ManualActivity[];
}): GarminWellnessImportResult {
  const scan = scanGarminWellness(input.cwd, {
    date: input.date,
    timezone: input.timezone,
    debug: input.debug,
  });
  const summary =
    scan.summaries.find((candidate) => candidate.date === input.date) ?? null;
  const importedActivities =
    input.importedActivities ??
    parseLocalExports(input.cwd, { timezone: input.timezone }).activities;
  const journal = updateJournalWithGarminWellness({
    cwd: input.cwd,
    date: input.date,
    summary,
    importedActivities: importedActivities.filter(
      (activity) => activity.date === input.date,
    ),
  });

  const warnings = [
    ...scan.warnings,
    ...(summary?.warnings ?? []),
    ...journal.warnings,
    ...(summary === null &&
    (scan.zipFilesFound > 0 || scan.looseFitFilesFound > 0)
      ? [`No Garmin wellness summary found for ${input.date}.`]
      : []),
  ];

  return {
    ...scan,
    journalPath: relative(input.cwd, journal.journalPath).replaceAll("\\", "/"),
    journalCreated: journal.journalCreated,
    fieldsPopulated: journal.fieldsPopulated,
    fieldsPreserved: journal.fieldsPreserved,
    journalUpdated: journal.journalUpdated,
    debugNotes:
      input.debug === true && summary !== null
        ? [...scan.debugNotes, ...metricSourceDebugNotes(summary)]
        : scan.debugNotes,
    warnings: unique(filterResolvedWarnings(warnings, summary)),
  };
}

export function formatGarminWellnessImportReport(
  result: GarminWellnessImportResult,
): string {
  return [
    "Garmin wellness import",
    "",
    `Evidence date: ${result.requestedDate}`,
    "",
    `ZIP files found: ${result.zipFilesFound}`,
    `Loose FIT files found: ${result.looseFitFilesFound}`,
    `Sleep CSV files found: ${result.sleepCsvFilesFound}`,
    `Sleep CSV records read: ${result.sleepCsvRecordsRead}`,
    `FIT files decoded: ${result.fitFilesDecoded}`,
    `FIT files skipped: ${result.fitFilesSkipped}`,
    `Ignored non-FIT entries: ${result.ignoredEntries}`,
    "",
    `Journal: ${result.journalPath}`,
    result.journalCreated ? "Journal created: yes" : "Journal created: no",
    result.journalUpdated ? "Journal updated: yes" : "Journal updated: no",
    "",
    "Fields populated:",
    ...formatList(result.fieldsPopulated),
    "",
    "Fields preserved from manual journal:",
    ...formatList(result.fieldsPreserved),
    "",
    "Warnings:",
    ...formatList(result.warnings),
    ...(result.debugNotes.length === 0
      ? []
      : ["", "Debug notes:", ...formatList(result.debugNotes)]),
  ].join("\n");
}

function formatList(values: string[]): string[] {
  return values.length === 0 ? ["- none"] : values.map((value) => `- ${value}`);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function metricSourceDebugNotes(
  summary: NonNullable<
    ReturnType<typeof scanGarminWellness>["summaries"][number]
  >,
): string[] {
  const sources = summary.fieldSources ?? {};
  const notes = Object.entries(sources).map(
    ([field, source]) => `${field}: ${source}`,
  );

  return notes.length === 0 ? [] : ["Metric source priority:", ...notes.sort()];
}

function filterResolvedWarnings(
  warnings: string[],
  summary: ReturnType<typeof scanGarminWellness>["summaries"][number] | null,
): string[] {
  if (summary?.sleepDurationMinutes === null || summary === null) {
    return warnings;
  }

  return warnings.filter(
    (warning) =>
      !warning.includes(
        "Sleep duration not imported; only untrusted sleep-stage or segment records were found.",
      ),
  );
}
