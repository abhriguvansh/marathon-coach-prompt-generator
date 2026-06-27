import type { Unknownish } from "../types";

export function formatUnknown(value: Unknownish, fallback = "unknown"): string {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string" && value.trim() === "") {
    return fallback;
  }

  return String(value);
}
