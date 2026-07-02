import { relative } from "node:path";
import { scanGarminWellness } from "./scanner";
import type { GarminWellnessImportResult } from "./types";
import { updateJournalWithGarminWellness } from "./journal-updater";

export function importGarminWellness(input: {
  cwd: string;
  date: string;
  timezone?: string | null;
}): GarminWellnessImportResult {
  const scan = scanGarminWellness(input.cwd, {
    date: input.date,
    timezone: input.timezone,
  });
  const summary =
    scan.summaries.find((candidate) => candidate.date === input.date) ?? null;
  const journal = updateJournalWithGarminWellness({
    cwd: input.cwd,
    date: input.date,
    summary,
  });

  return {
    ...scan,
    journalPath: relative(input.cwd, journal.journalPath).replaceAll("\\", "/"),
    journalCreated: journal.journalCreated,
    fieldsPopulated: journal.fieldsPopulated,
    fieldsPreserved: journal.fieldsPreserved,
    journalUpdated: journal.journalUpdated,
    warnings: [
      ...scan.warnings,
      ...journal.warnings,
      ...(summary === null &&
      (scan.zipFilesFound > 0 || scan.looseFitFilesFound > 0)
        ? [`No Garmin wellness summary found for ${input.date}.`]
        : []),
    ],
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
  ].join("\n");
}

function formatList(values: string[]): string[] {
  return values.length === 0 ? ["- none"] : values.map((value) => `- ${value}`);
}
