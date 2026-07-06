import type { ManualActivity } from "../types";
import { normalizeActivityType } from "./activity-classification";

export function applyJournalFullSessionOverrides(
  activities: ManualActivity[],
): ManualActivity[] {
  const overrides = activities.filter(isJournalFullSessionOverride);
  const baseActivities = activities.filter(
    (activity) => !isJournalFullSessionOverride(activity),
  );
  const usedOverrides = new Set<number>();

  const merged = baseActivities.map((activity) => {
    const overrideIndex = overrides.findIndex(
      (candidate, index) =>
        !usedOverrides.has(index) && matchesActivity(candidate, activity),
    );

    if (overrideIndex === -1) {
      return activity;
    }

    usedOverrides.add(overrideIndex);

    return applyOverride(activity, overrides[overrideIndex]);
  });

  return [
    ...merged,
    ...overrides.filter((_, index) => !usedOverrides.has(index)),
  ];
}

export function isJournalFullSessionOverride(
  activity: ManualActivity,
): boolean {
  return activity.source === "journal_full_session_override";
}

function matchesActivity(
  override: ManualActivity,
  activity: ManualActivity,
): boolean {
  return (
    override.date === activity.date &&
    normalizeActivityType(override.activityType) ===
      normalizeActivityType(activity.activityType)
  );
}

function applyOverride(
  activity: ManualActivity,
  override: ManualActivity,
): ManualActivity {
  const notes = [
    activity.notes,
    override.notes === null
      ? null
      : `Manual full-session override: ${override.notes}`,
  ]
    .filter((value): value is string => value !== null && value.trim() !== "")
    .join(" ");

  return {
    ...activity,
    distanceMiles: override.distanceMiles ?? activity.distanceMiles,
    distanceSource:
      override.distanceMiles === null
        ? (activity.distanceSource ?? "device_recording")
        : "manual_full_session",
    durationMinutes: override.durationMinutes ?? activity.durationMinutes,
    durationSource:
      override.durationMinutes === null
        ? (activity.durationSource ?? "device_recording")
        : "manual_full_session",
    metricsSource: activity.source,
    notes: notes === "" ? null : notes,
    dataQualityNotes: [
      ...(activity.dataQualityNotes ?? []),
      "Manual full-session correction applied; device metrics retained from the recorded portion.",
    ],
  };
}
