import type { StepValue } from "../types";

const PLACEHOLDER_STEP_VALUES = new Set([
  "unknown",
  "not provided",
  "todo",
  "fill in",
  "placeholder",
]);

export interface ParsedStepValue {
  display: string | null;
  approx: number | null;
}

export function parseStepValue(value: string | null | undefined): StepValue {
  return parseStepDetails(value).display;
}

export function parseStepDetails(
  value: string | number | null | undefined,
): ParsedStepValue {
  if (value === null || value === undefined) {
    return { display: null, approx: null };
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { display: String(value), approx: value }
      : { display: null, approx: null };
  }

  const trimmed = value.trim();

  if (trimmed === "" || PLACEHOLDER_STEP_VALUES.has(trimmed.toLowerCase())) {
    return { display: null, approx: null };
  }

  const numeric = numericStepCount(trimmed);

  return { display: trimmed, approx: numeric };
}

export function numericStepCount(value: StepValue | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "" || PLACEHOLDER_STEP_VALUES.has(normalized)) {
    return null;
  }

  const thousandsMatch = normalized.match(
    /(?:about|around|approximately|approx\.?)?\s*~?\s*(\d+(?:\.\d+)?)\s*k\b/,
  );

  if (thousandsMatch) {
    return Math.round(Number(thousandsMatch[1]) * 1000);
  }

  const numberMatch = normalized.match(/\b(\d{1,3}(?:,\d{3})+|\d+)\b/);

  if (!numberMatch) {
    return null;
  }

  const parsed = Number(numberMatch[1].replaceAll(",", ""));

  return Number.isFinite(parsed) ? parsed : null;
}

export function isProvidedStepValue(value: StepValue | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  const normalized = value.trim().toLowerCase();

  return normalized !== "" && !PLACEHOLDER_STEP_VALUES.has(normalized);
}

export function isHighStepDay(value: StepValue | undefined): boolean {
  const steps = numericStepCount(value);

  return steps !== null && steps > 10_000;
}

export function stepApprox(value: {
  totalSteps?: StepValue;
  stepsApprox?: number | null;
}): number | null {
  return value.stepsApprox ?? numericStepCount(value.totalSteps);
}

export function isHighStepNote(value: {
  totalSteps?: StepValue;
  stepsApprox?: number | null;
}): boolean {
  const steps = stepApprox(value);

  return steps !== null && steps > 10_000;
}

export function formatStepValue(value: {
  totalSteps?: StepValue;
  stepsDisplay?: string | null;
}): string {
  if (value.stepsDisplay && value.stepsDisplay.trim() !== "") {
    return value.stepsDisplay;
  }

  if (value.totalSteps === null || value.totalSteps === undefined) {
    return "unknown";
  }

  return String(value.totalSteps);
}
