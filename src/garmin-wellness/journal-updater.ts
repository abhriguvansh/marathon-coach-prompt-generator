import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  refreshImportedActivitiesSection,
  renderJournalTemplate,
} from "../parsers/journal";
import type { ManualActivity } from "../types";
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
  kind?:
    | "steps"
    | "sleepDuration"
    | "sleepScore"
    | "restingHeartRate"
    | "overnightHrv"
    | "hrvStatus";
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
  "Sleep Quality",
  "Deep Sleep Duration",
  "Light Sleep Duration",
  "REM Duration",
  "Awake Duration",
  "Restless Moments",
  "Resting Heart Rate",
  "Average Overnight Heart Rate",
  "Overnight HRV",
  "HRV Status",
  "Stress (0-10 or words)",
  "Garmin Stress",
  "Body Battery",
  "Average Respiration",
  "Lowest Respiration",
  "Average SpO2",
  "Lowest SpO2",
  "Breathing Variations",
  "Total Steps",
  "Workout Structure",
];

export function updateJournalWithGarminWellness(input: {
  cwd: string;
  date: string;
  summary: GarminWellnessSummary | null;
  importedActivities?: ManualActivity[];
}): WellnessJournalUpdateResult {
  const journalPath = join(input.cwd, JOURNAL_FOLDER, `${input.date}.md`);
  const fields = wellnessFields(input.summary);
  const hasImportableFields = hasImportableField(fields);
  const hasImportedActivities = (input.importedActivities ?? []).length > 0;
  let journalCreated = false;

  if (
    !hasImportableFields &&
    !hasImportedActivities &&
    !existsSync(journalPath)
  ) {
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
        importedActivities: input.importedActivities ?? [],
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
  const refreshed = refreshImportedActivitiesSection({
    content,
    importedActivities: input.importedActivities ?? [],
  });
  const updated = hasImportableFields
    ? updateRecoverySection({
        content: refreshed.content,
        lineEnding,
        fields,
        populated,
        preserved,
        warnings,
      })
    : refreshed.content;
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
  const lines = coalesceRecoverySections(input.content, input.lineEnding).split(
    /\r?\n/,
  );
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
    if (SUBJECTIVE_FIELDS.has(field.label)) {
      continue;
    }

    const existingIndex = fieldLineByLabel.get(field.label);

    if (existingIndex !== undefined) {
      const current = currentFieldValue(recoveryLines[existingIndex]);

      if (field.value === null) {
        if (shouldClearUntrustedExistingValue(field, current)) {
          recoveryLines[existingIndex] = `${field.label}:`;
          input.warnings.push(
            `${field.label} cleared because the existing value looked unavailable or untrusted.`,
          );
        }
        continue;
      }

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

function coalesceRecoverySections(content: string, lineEnding: string): string {
  const lines = content.split(/\r?\n/);
  const starts = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => /^##\s+Recovery\s*$/i.test(entry.line))
    .map((entry) => entry.index);

  if (starts.length <= 1) {
    return content;
  }

  const firstStart = starts[0];
  const firstEnd = sectionEnd(lines, firstStart);
  const firstBody = lines.slice(firstStart + 1, firstEnd);
  const firstFields = indexFieldLines(firstBody);
  const customLines: string[] = [];
  const removeRanges: Array<{ start: number; end: number }> = [];

  for (const start of starts.slice(1)) {
    const end = sectionEnd(lines, start);
    const body = lines.slice(start + 1, end);

    for (const line of body) {
      const parsed = parseFieldLine(line);

      if (!parsed) {
        if (line.trim() !== "") {
          customLines.push(line);
        }
        continue;
      }

      const existingIndex = firstFields.get(parsed.label);

      if (existingIndex === undefined) {
        firstBody.push(`${parsed.label}: ${parsed.value}`, "");
        rebuildFieldIndex(firstFields, firstBody);
        continue;
      }

      if (
        isBlankish(currentFieldValue(firstBody[existingIndex])) &&
        !isBlankish(parsed.value)
      ) {
        firstBody[existingIndex] = `${parsed.label}: ${parsed.value}`;
      }
    }

    removeRanges.push({ start, end });
  }

  if (customLines.length > 0) {
    firstBody.push("", ...customLines);
  }

  const rebuilt = [
    ...lines.slice(0, firstStart + 1),
    ...firstBody,
    ...lines.slice(firstEnd),
  ];

  for (const range of removeRanges.reverse()) {
    const adjustedStart =
      range.start - (firstEnd - firstStart - 1) + firstBody.length;
    const adjustedEnd =
      range.end - (firstEnd - firstStart - 1) + firstBody.length;
    rebuilt.splice(adjustedStart, adjustedEnd - adjustedStart);
  }

  return rebuilt.join(lineEnding);
}

function sectionEnd(lines: string[], start: number): number {
  const next = findNextSection(lines, start + 1);

  return next === -1 ? lines.length : next;
}

function parseFieldLine(line: string): { label: string; value: string } | null {
  const match = line.match(/^([^:]+):\s*(.*)$/);

  if (!match) {
    return null;
  }

  return {
    label: canonicalRecoveryLabel(match[1].trim()),
    value: match[2].trim(),
  };
}

function canonicalRecoveryLabel(label: string): string {
  const match = RECOVERY_FIELD_ORDER.find(
    (candidate) => normalizeLabel(candidate) === normalizeLabel(label),
  );

  return match ?? label;
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "");
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
      kind: "sleepDuration",
      value:
        summary.sleepDurationMinutes === null
          ? null
          : formatSleepDuration(summary.sleepDurationMinutes),
    },
    {
      label: "Sleep Score",
      kind: "sleepScore",
      value: summary.sleepScore === null ? null : String(summary.sleepScore),
    },
    { label: "Sleep Quality", value: nonBlank(summary.sleepQuality) },
    {
      label: "Deep Sleep Duration",
      value:
        summary.deepSleepDurationMinutes === null
          ? null
          : formatSleepDuration(summary.deepSleepDurationMinutes),
    },
    {
      label: "Light Sleep Duration",
      value:
        summary.lightSleepDurationMinutes === null
          ? null
          : formatSleepDuration(summary.lightSleepDurationMinutes),
    },
    {
      label: "REM Duration",
      value:
        summary.remDurationMinutes === null
          ? null
          : formatSleepDuration(summary.remDurationMinutes),
    },
    {
      label: "Awake Duration",
      value:
        summary.awakeDurationMinutes === null
          ? null
          : formatSleepDuration(summary.awakeDurationMinutes),
    },
    {
      label: "Restless Moments",
      value:
        summary.restlessMoments === null
          ? null
          : String(summary.restlessMoments),
    },
    {
      label: "Resting Heart Rate",
      kind: "restingHeartRate",
      value:
        summary.restingHeartRate === null
          ? null
          : `${summary.restingHeartRate} bpm`,
    },
    {
      label: "Average Overnight Heart Rate",
      value:
        summary.averageOvernightHeartRate === null
          ? null
          : `${summary.averageOvernightHeartRate} bpm`,
    },
    {
      label: "Overnight HRV",
      kind: "overnightHrv",
      value:
        summary.overnightHrv === null ? null : `${summary.overnightHrv} ms`,
    },
    {
      label: "HRV Status",
      kind: "hrvStatus",
      value: nonBlank(summary.hrvStatus),
    },
    {
      label: "Garmin Stress",
      value:
        summary.garminStress === null ? null : String(summary.garminStress),
    },
    { label: "Body Battery", value: nonBlank(summary.bodyBattery) },
    {
      label: "Average Respiration",
      value:
        summary.respirationRate === null
          ? null
          : String(summary.respirationRate),
    },
    {
      label: "Lowest Respiration",
      value:
        summary.lowestRespirationRate === null
          ? null
          : String(summary.lowestRespirationRate),
    },
    {
      label: "Average SpO2",
      value: summary.pulseOx === null ? null : `${summary.pulseOx}%`,
    },
    {
      label: "Lowest SpO2",
      value:
        summary.lowestPulseOx === null ? null : `${summary.lowestPulseOx}%`,
    },
    {
      label: "Breathing Variations",
      value: nonBlank(summary.breathingVariations),
    },
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

function shouldClearUntrustedExistingValue(
  field: WellnessField,
  current: string,
): boolean {
  if (current.trim() === "") {
    return false;
  }

  switch (field.kind) {
    case "sleepDuration": {
      const minutes = parseDurationMinutes(current);

      return minutes !== null && minutes < 60;
    }
    case "sleepScore": {
      const score = parseNumber(current);

      return score !== null && score <= 0;
    }
    case "restingHeartRate": {
      const heartRate = parseNumber(current);

      return heartRate !== null && heartRate >= 100;
    }
    case "overnightHrv": {
      const hrv = parseNumber(current);

      return hrv !== null && (hrv <= 0 || hrv === 255 || hrv > 250);
    }
    case "hrvStatus":
      return ["unknown", "unavailable"].includes(current.trim().toLowerCase());
    default:
      return false;
  }
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

function parseDurationMinutes(value: string): number | null {
  const hours = value.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minutes = value.match(/(\d+(?:\.\d+)?)\s*m/i);

  if (hours || minutes) {
    return (
      (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)
    );
  }

  return parseNumber(value);
}

function parseNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);

  return match ? Number(match[0]) : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
