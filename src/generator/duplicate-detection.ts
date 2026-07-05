import type { DuplicateActivityWarning, ManualActivity } from "../types";
import { normalizeActivityType } from "./activity-classification";

export interface DuplicateAnalysis {
  activitiesForTotals: ManualActivity[];
  warnings: DuplicateActivityWarning[];
}

interface DuplicateCandidate {
  keepIndex: number;
  duplicateIndex: number;
  confidence: "high_confidence" | "uncertain";
  reason: string;
}

const DISTANCE_ABSOLUTE_TOLERANCE_MILES = 0.03;
const DISTANCE_RELATIVE_TOLERANCE = 0.02;
const DURATION_ABSOLUTE_TOLERANCE_MINUTES = 1;
const DURATION_RELATIVE_TOLERANCE = 0.02;
const START_TIME_TOLERANCE_MINUTES = 5;

export function analyzeActivityDuplicates(
  activities: ManualActivity[],
): DuplicateAnalysis {
  const candidates: DuplicateCandidate[] = [];
  const excludedIndexes = new Set<number>();
  const mergedActivities = activities.map((activity) => ({ ...activity }));

  for (let leftIndex = 0; leftIndex < activities.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < activities.length;
      rightIndex += 1
    ) {
      const candidate = compareActivities(
        activities[leftIndex],
        activities[rightIndex],
        leftIndex,
        rightIndex,
      );

      if (!candidate) {
        continue;
      }

      candidates.push(candidate);

      if (candidate.confidence === "high_confidence") {
        excludedIndexes.add(candidate.duplicateIndex);
        mergeDuplicateContext(
          mergedActivities[candidate.keepIndex],
          mergedActivities[candidate.duplicateIndex],
        );
      }
    }
  }

  return {
    activitiesForTotals: activityTotalsFromMerged(
      mergedActivities,
      excludedIndexes,
    ),
    warnings: candidates.map((candidate) =>
      duplicateWarning(mergedActivities, candidate),
    ),
  };
}

function activityTotalsFromMerged(
  activities: ManualActivity[],
  excludedIndexes: Set<number>,
): ManualActivity[] {
  return activities.filter((_, index) => !excludedIndexes.has(index));
}

function compareActivities(
  left: ManualActivity,
  right: ManualActivity,
  leftIndex: number,
  rightIndex: number,
): DuplicateCandidate | null {
  if (left.date !== right.date) {
    return null;
  }

  if (
    normalizeActivityType(left.activityType) !==
    normalizeActivityType(right.activityType)
  ) {
    return null;
  }

  if (left.source === right.source) {
    return null;
  }

  const distanceClose = valuesClose(
    left.distanceMiles,
    right.distanceMiles,
    DISTANCE_ABSOLUTE_TOLERANCE_MILES,
    DISTANCE_RELATIVE_TOLERANCE,
  );
  const durationClose = valuesClose(
    left.durationMinutes,
    right.durationMinutes,
    DURATION_ABSOLUTE_TOLERANCE_MINUTES,
    DURATION_RELATIVE_TOLERANCE,
  );
  const startTimesComparable =
    hasValue(left.startTime) && hasValue(right.startTime);
  const startTimeClose =
    startTimesComparable && startTimesAreClose(left.startTime, right.startTime);
  const distanceComparable =
    left.distanceMiles !== null && right.distanceMiles !== null;
  const durationComparable =
    left.durationMinutes !== null && right.durationMinutes !== null;

  if (distanceClose && durationClose && !(isTennis(left) && isTennis(right))) {
    return {
      keepIndex: preferredKeepIndex(left, right, leftIndex, rightIndex),
      duplicateIndex: preferredDuplicateIndex(
        left,
        right,
        leftIndex,
        rightIndex,
      ),
      confidence: "high_confidence",
      reason: startTimeClose
        ? "same date/type with close start time, distance, and duration"
        : "same date/type with close distance and duration",
    };
  }

  if (isTennis(left) && isTennis(right) && durationClose) {
    return {
      keepIndex: preferredKeepIndex(left, right, leftIndex, rightIndex),
      duplicateIndex: preferredDuplicateIndex(
        left,
        right,
        leftIndex,
        rightIndex,
      ),
      confidence:
        startTimeClose || hasExportAndManual(left, right)
          ? "high_confidence"
          : "uncertain",
      reason: startTimeClose
        ? "same date/type with close start time and duration"
        : "same date/type with close duration",
    };
  }

  if (distanceClose || durationClose) {
    return {
      keepIndex: leftIndex,
      duplicateIndex: rightIndex,
      confidence: "uncertain",
      reason: "same date/type with partial similarity",
    };
  }

  if (startTimeClose && (!distanceComparable || !durationComparable)) {
    return {
      keepIndex: leftIndex,
      duplicateIndex: rightIndex,
      confidence: "uncertain",
      reason: "same date/type with close start time but incomplete metrics",
    };
  }

  return null;
}

function duplicateWarning(
  activities: ManualActivity[],
  candidate: DuplicateCandidate,
): DuplicateActivityWarning {
  const kept = activities[candidate.keepIndex];
  const duplicate = activities[candidate.duplicateIndex];
  const action =
    candidate.confidence === "high_confidence"
      ? "excluded one likely duplicate from totals"
      : "kept both activities in totals";

  return {
    level: candidate.confidence,
    excludedFromTotals: candidate.confidence === "high_confidence",
    message: `${kept.date} ${kept.activityType}: ${candidate.reason}; ${action} (${kept.source} vs ${duplicate.source}).`,
  };
}

function preferredKeepIndex(
  left: ManualActivity,
  right: ManualActivity,
  leftIndex: number,
  rightIndex: number,
): number {
  const leftPriority = sourcePriority(left);
  const rightPriority = sourcePriority(right);

  if (leftPriority < rightPriority) {
    return leftIndex;
  }

  if (rightPriority < leftPriority) {
    return rightIndex;
  }

  return leftIndex;
}

function preferredDuplicateIndex(
  left: ManualActivity,
  right: ManualActivity,
  leftIndex: number,
  rightIndex: number,
): number {
  return preferredKeepIndex(left, right, leftIndex, rightIndex) === leftIndex
    ? rightIndex
    : leftIndex;
}

function valuesClose(
  left: number | null,
  right: number | null,
  absoluteTolerance: number,
  relativeTolerance: number,
): boolean {
  if (left === null || right === null) {
    return false;
  }

  const difference = Math.abs(left - right);
  const relativeBase = Math.max(Math.abs(left), Math.abs(right));

  return (
    difference <= absoluteTolerance ||
    difference <= relativeBase * relativeTolerance
  );
}

function startTimesAreClose(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftMinutes = minutesFromTime(left);
  const rightMinutes = minutesFromTime(right);

  if (leftMinutes === null || rightMinutes === null) {
    return false;
  }

  return Math.abs(leftMinutes - rightMinutes) <= START_TIME_TOLERANCE_MINUTES;
}

function minutesFromTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/T?(\d{2}):(\d{2})/);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function hasValue(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== "";
}

function sourcePriority(activity: ManualActivity): number {
  if (isTennis(activity)) {
    switch (activity.source) {
      case "garmin_fit_export":
      case "strava_fit_export":
      case "garmin_export":
      case "strava_export":
        return 0;
      case "manual":
      case "journal":
        return 1;
      default:
        return 5;
    }
  }

  switch (activity.source) {
    case "manual":
    case "journal":
      return 0;
    case "garmin_fit_export":
      return 1;
    case "strava_fit_export":
      return 2;
    case "garmin_export":
      return 3;
    case "strava_export":
      return 4;
    default:
      return 5;
  }
}

function mergeDuplicateContext(
  kept: ManualActivity,
  duplicate: ManualActivity,
): void {
  if (duplicate.notes && !kept.notes?.includes(duplicate.notes)) {
    kept.notes = kept.notes
      ? `${kept.notes} Manual duplicate note: ${duplicate.notes}`
      : duplicate.notes;
  }

  kept.dataQualityNotes = [
    ...(kept.dataQualityNotes ?? []),
    `${kept.activityType} duplicate handled once for totals; objective export metrics were kept when available and manual notes were retained.`,
  ];
}

function isTennis(activity: ManualActivity): boolean {
  return normalizeActivityType(activity.activityType) === "tennis";
}

function hasExportAndManual(
  left: ManualActivity,
  right: ManualActivity,
): boolean {
  const sources = [left.source, right.source].map((source) =>
    source.toLowerCase(),
  );

  return (
    sources.some((source) => source.includes("export")) &&
    sources.some((source) => source === "manual" || source === "journal")
  );
}
