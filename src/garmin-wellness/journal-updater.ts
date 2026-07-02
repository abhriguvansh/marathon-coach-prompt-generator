import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderJournalTemplate } from "../parsers/journal";
import { parseStepDetails } from "../utils/steps";
import type { GarminWellnessSummary } from "./types";

export interface WellnessJournalUpdateResult {
  journalPath: string;
  journalCreated: boolean;
  journalUpdated: boolean;
  fieldsPopulated: string[];
  fieldsPreserved: string[];
  warnings: string[];
}

interface WellnessField {
  label: string;
  value: string | null;
  kind?: "steps";
}

const JOURNAL_FOLDER = "input/journal";
const SUBJECTIVE_FIELDS = new Set([
  "Soreness (0-10 or words)",
  "Pain (0-10 or words)",
  "Pain Location",
  "Pain Type",
  "Did pain change gait? (Yes/No)",
  "Energy (0-10 or words)",
  "Fatigue (0-10 or words)",
  "Stress (0-10 or words)",
  "Motivation (0-10 or words)",
]);

const RECOVERY_FIELD_ORDER = [
  "Soreness (0-10 or words)",
  "Pain (0-10 or words)",
  "Pain Location",
  "Pain Type",
  "Did pain change gait? (Yes/No)",
  "Energy (0-10 or words)",
  "Fatigue (0-10 or words)",
  "Sleep",
  "Sleep Duration",
  "Sleep Score",
  "Resting Heart Rate",
  "Overnight HRV",
  "HRV Status",
  "Stress (0-10 or words)",
  "Garmin Stress",
  "Body Battery",
  "Total Steps",
  "Workout Structure",
];

export function updateJournalWithGarminWellness(input: {
  cwd: string;
  date: string;
  summary: GarminWellnessSummary | null;
}): WellnessJournalUpdateResult {
  const journalPath = join(input.cwd, JOURNAL_FOLDER, `${input.date}.md`);
  const fields = wellnessFields(input.summary);
  let journalCreated = false;

  if (!hasImportableField(fields)) {
    return {
      journalPath,
      journalCreated: false,
      journalUpdated: false,
      fieldsPopulated: [],
      fieldsPreserved: [],
      warnings: [],
    };
  }

  if (!existsSync(journalPath)) {
    mkdirSync(dirname(journalPath), { recursive: true });
    writeFileSync(
      journalPath,
      renderJournalTemplate({
        cwd: input.cwd,
        date: input.date,
        importedActivities: [],
      }),
    );
    journalCreated = true;
  }

  const original = readFileSync(journalPath, "utf8");
  const hadBom = original.charCodeAt(0) === 0xfeff;
  const content = hadBom ? original.slice(1) : original;
  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
  const populated: string[] = [];
  const preserved: string[] = [];
  const warnings: string[] = [];
  const updated = updateRecoverySection({
    content,
    lineEnding,
    fields,
    populated,
    preserved,
    warnings,
  });
  const finalContent = hadBom ? `\ufeff${updated}` : updated;
  const changed = finalContent !== original;

  if (changed) {
    writeFileSync(journalPath, finalContent);
  }

  return {
    journalPath,
    journalCreated,
    journalUpdated: changed,
    fieldsPopulated: populated,
    fieldsPreserved: preserved,
    warnings,
  };
}

function updateRecoverySection(input: {
  content: string;
  lineEnding: string;
  fields: WellnessField[];
  populated: string[];
  preserved: string[];
  warnings: string[];
}): string {
  const lines = input.content.split(/\r?\n/);
  const recoveryStart = findSectionStart(lines, "Recovery");

  if (recoveryStart === -1) {
    const appended = [
      ...lines,
      lines[lines.length - 1] === "" ? null : "",
      "## Recovery",
      "",
      ...recoveryFieldLines(input.fields, input.populated),
    ].filter((value): value is string => value !== null);

    return appended.join(input.lineEnding);
  }

  const recoveryEnd = findNextSection(lines, recoveryStart + 1);
  const end = recoveryEnd === -1 ? lines.length : recoveryEnd;
  const recoveryLines = lines.slice(recoveryStart + 1, end);
  const fieldLineByLabel = indexFieldLines(recoveryLines);

  for (const field of input.fields) {
    if (field.value === null || SUBJECTIVE_FIELDS.has(field.label)) {
      continue;
    }

    const existingIndex = fieldLineByLabel.get(field.label);

    if (existingIndex !== undefined) {
      const current = currentFieldValue(recoveryLines[existingIndex]);

      if (isBlankish(current)) {
        const replacement = `${field.label}: ${field.value}`;

        if (recoveryLines[existingIndex] !== replacement) {
          recoveryLines[existingIndex] = replacement;
          input.populated.push(field.label);
        }
      } else {
        input.preserved.push(field.label);
        maybeWarnConflict(field, current, input.warnings);
      }
    }
  }

  for (const field of input.fields) {
    if (
      field.value === null ||
      SUBJECTIVE_FIELDS.has(field.label) ||
      fieldLineByLabel.has(field.label)
    ) {
      continue;
    }

    const insertAt = insertionIndex(
      recoveryLines,
      fieldLineByLabel,
      field.label,
    );
    recoveryLines.splice(insertAt, 0, `${field.label}: ${field.value}`, "");
    rebuildFieldIndex(fieldLineByLabel, recoveryLines);
    input.populated.push(field.label);
  }

  return [
    ...lines.slice(0, recoveryStart + 1),
    ...recoveryLines,
    ...lines.slice(end),
  ].join(input.lineEnding);
}

function wellnessFields(
  summary: GarminWellnessSummary | null,
): WellnessField[] {
  if (summary === null) {
    return [];
  }

  return [
    {
      label: "Sleep Duration",
      value:
        summary.sleepDurationMinutes === null
          ? null
          : formatSleepDuration(summary.sleepDurationMinutes),
    },
    {
      label: "Sleep Score",
      value: summary.sleepScore === null ? null : String(summary.sleepScore),
    },
    {
      label: "Resting Heart Rate",
      value:
        summary.restingHeartRate === null
          ? null
          : `${summary.restingHeartRate} bpm`,
    },
    {
      label: "Overnight HRV",
      value:
        summary.overnightHrv === null ? null : `${summary.overnightHrv} ms`,
    },
    { label: "HRV Status", value: nonBlank(summary.hrvStatus) },
    {
      label: "Garmin Stress",
      value:
        summary.garminStress === null ? null : String(summary.garminStress),
    },
    { label: "Body Battery", value: nonBlank(summary.bodyBattery) },
    {
      label: "Total Steps",
      value:
        summary.totalSteps === null
          ? null
          : summary.totalSteps.toLocaleString("en-US"),
      kind: "steps",
    },
  ];
}

function recoveryFieldLines(
  fields: WellnessField[],
  populated: string[],
): string[] {
  const fieldByLabel = new Map(fields.map((field) => [field.label, field]));
  const lines: string[] = [];

  for (const label of RECOVERY_FIELD_ORDER) {
    const value = fieldByLabel.get(label)?.value ?? "";
    lines.push(`${label}: ${value}`);
    lines.push("");

    if (value !== "") {
      populated.push(label);
    }
  }

  return lines;
}

function nonBlank(value: string | null): string | null {
  return value !== null && value.trim() !== "" ? value.trim() : null;
}

function indexFieldLines(lines: string[]): Map<string, number> {
  const index = new Map<string, number>();

  rebuildFieldIndex(index, lines);

  return index;
}

function rebuildFieldIndex(index: Map<string, number>, lines: string[]): void {
  index.clear();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const label = fieldLabel(lines[lineIndex]);

    if (label !== null && !index.has(label)) {
      index.set(label, lineIndex);
    }
  }
}

function insertionIndex(
  lines: string[],
  fieldLineByLabel: Map<string, number>,
  label: string,
): number {
  const orderIndex = RECOVERY_FIELD_ORDER.indexOf(label);

  for (let index = orderIndex - 1; index >= 0; index -= 1) {
    const previous = fieldLineByLabel.get(RECOVERY_FIELD_ORDER[index]);

    if (previous !== undefined) {
      return previous + 1;
    }
  }

  for (
    let index = orderIndex + 1;
    index < RECOVERY_FIELD_ORDER.length;
    index += 1
  ) {
    const next = fieldLineByLabel.get(RECOVERY_FIELD_ORDER[index]);

    if (next !== undefined) {
      return next;
    }
  }

  return lines.length;
}

function hasImportableField(fields: WellnessField[]): boolean {
  return fields.some((field) => field.value !== null);
}

function maybeWarnConflict(
  field: WellnessField,
  current: string,
  warnings: string[],
): void {
  if (field.kind !== "steps" || field.value === null) {
    return;
  }

  const manual = parseStepDetails(current).approx;
  const garmin = parseStepDetails(field.value).approx;

  if (manual === null || garmin === null) {
    return;
  }

  if (Math.abs(manual - garmin) > Math.max(500, garmin * 0.1)) {
    warnings.push(
      "Manual steps differ materially from Garmin wellness steps; manual value preserved.",
    );
  }
}

function currentFieldValue(line: string): string {
  const index = line.indexOf(":");

  return index === -1 ? "" : line.slice(index + 1).trim();
}

function fieldLabel(line: string): string | null {
  const match = line.match(/^([^:]+):/);

  return match?.[1]?.trim() ?? null;
}

function findSectionStart(lines: string[], heading: string): number {
  const pattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "i");

  return lines.findIndex((line) => pattern.test(line));
}

function findNextSection(lines: string[], start: number): number {
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      return index;
    }
  }

  return -1;
}

function isBlankish(value: string): boolean {
  return (
    value.trim() === "" ||
    [
      "---",
      "unknown",
      "not provided",
      "todo",
      "fill in",
      "placeholder",
      "tbd",
    ].includes(value.trim().toLowerCase())
  );
}

function formatSleepDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;

  return `${hours}h ${remainingMinutes}m`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
