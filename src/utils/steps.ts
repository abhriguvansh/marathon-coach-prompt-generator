import type { StepValue } from "../types";

export function parseStepValue(value: string | null | undefined): StepValue {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return null;
  }

  const numeric = numericStepCount(trimmed);

  return numeric ?? trimmed;
}

export function numericStepCount(value: StepValue | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "") {
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

  return value.trim() !== "";
}

export function isHighStepDay(value: StepValue | undefined): boolean {
  const steps = numericStepCount(value);

  return steps !== null && steps > 10_000;
}
