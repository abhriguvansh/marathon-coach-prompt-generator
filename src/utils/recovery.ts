import type { RecoveryValue } from "../types";
import { parseOptionalNumber } from "./csv";

const PLACEHOLDER_VALUES = new Set([
  "not provided",
  "unknown",
  "tbd",
  "todo",
  "fill in",
  "placeholder",
]);

const NOT_APPLICABLE_VALUES = new Set(["na", "n/a", "not applicable"]);
const NONE_VALUES = new Set(["none", "no", "no pain", "no fatigue"]);
const NO_GAIT_VALUES = new Set([
  "no",
  "none",
  "na",
  "n/a",
  "not applicable",
  "no gait change",
  "did not change gait",
  "unchanged",
]);

export function parseRecoveryValue(
  value: string | null | undefined,
  options: { allowNone?: boolean; allowNotApplicable?: boolean } = {},
): RecoveryValue {
  const normalized = normalize(value);

  if (normalized === null || PLACEHOLDER_VALUES.has(normalized)) {
    return null;
  }

  if (!options.allowNotApplicable && NOT_APPLICABLE_VALUES.has(normalized)) {
    return null;
  }

  if (!options.allowNone && NONE_VALUES.has(normalized)) {
    return null;
  }

  const number = parseOptionalNumber(value ?? undefined);

  return number === null ? (value?.trim() ?? null) : number;
}

export function parseGaitChangedValue(
  value: string | null | undefined,
  pain: RecoveryValue,
): boolean | string | null {
  const normalized = normalize(value);

  if (normalized === null || PLACEHOLDER_VALUES.has(normalized)) {
    return null;
  }

  if (["yes", "y", "true", "1"].includes(normalized)) {
    return true;
  }

  if (["no", "n", "false", "0"].includes(normalized)) {
    return false;
  }

  if (NO_GAIT_VALUES.has(normalized) && isNoPain(pain)) {
    return false;
  }

  if (NO_GAIT_VALUES.has(normalized)) {
    return false;
  }

  return value?.trim() ?? null;
}

export function isProvidedRecoveryValue(
  value: RecoveryValue | boolean | undefined,
  options: { allowNotApplicable?: boolean; allowNone?: boolean } = {},
): boolean {
  if (typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  const normalized = normalize(value);

  if (normalized === null || PLACEHOLDER_VALUES.has(normalized)) {
    return false;
  }

  if (!options.allowNotApplicable && NOT_APPLICABLE_VALUES.has(normalized)) {
    return false;
  }

  if (!options.allowNone && NONE_VALUES.has(normalized)) {
    return false;
  }

  return true;
}

export function numericRecoveryValue(
  value: RecoveryValue | undefined,
): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const firstNumber = value.match(/\d+(?:\.\d+)?/);

  return firstNumber ? Number(firstNumber[0]) : null;
}

export function isNoPain(value: RecoveryValue | undefined): boolean {
  if (value === 0) {
    return true;
  }

  const normalized = normalize(value);

  return (
    normalized !== null &&
    (normalized === "0" ||
      normalized === "0/10" ||
      normalized === "none" ||
      normalized === "no pain")
  );
}

export function formatRecoveryValue(
  value: RecoveryValue | boolean | undefined,
  fallback = "unknown",
): string {
  if (value === true) {
    return "Yes";
  }

  if (value === false) {
    return "No";
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string" && value.trim() === "") {
    return fallback;
  }

  return String(value);
}

function normalize(value: RecoveryValue | boolean | undefined): string | null {
  if (value === null || value === undefined || typeof value === "boolean") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();

  return normalized === "" ? null : normalized;
}
