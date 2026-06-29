import type { CheckInCompleteness, DailySummary } from "../types";

const PLACEHOLDER_VALUES = new Set([
  "not provided",
  "unknown",
  "n/a",
  "na",
  "none provided",
]);

export function evaluateCheckInCompleteness(
  summary: Omit<DailySummary, "checkInCompleteness">,
): CheckInCompleteness {
  const missingHighValueFields: string[] = [];
  const optionalReminders: string[] = [];
  const activityContext = summary.runs.length
    ? "run"
    : summary.manualActivities.length
      ? "non_run_activity"
      : "no_activity";

  addMissing(
    missingHighValueFields,
    "soreness",
    hasNumber(summary.dailyNote?.legSoreness),
  );
  addMissing(
    missingHighValueFields,
    "pain",
    hasNumber(summary.dailyNote?.pain),
  );
  addMissing(
    missingHighValueFields,
    "gait changed",
    typeof summary.dailyNote?.gaitChanged === "boolean",
  );
  addMissing(
    missingHighValueFields,
    "energy",
    hasNumber(summary.dailyNote?.energy),
  );
  addMissing(
    missingHighValueFields,
    "steps",
    hasNumber(summary.dailyNote?.totalSteps),
  );
  addMissing(
    missingHighValueFields,
    "sleep",
    hasNumber(summary.dailyNote?.sleepQuality),
  );
  addMissing(
    missingHighValueFields,
    "tomorrow constraints / coach notes",
    hasText(summary.journalEntry?.coachNotes),
  );

  if (activityContext === "run") {
    addMissing(
      missingHighValueFields,
      "fatigue",
      hasNumber(summary.dailyNote?.fatigue),
    );
    addMissing(missingHighValueFields, "shoes", hasGear(summary));
  }

  if (activityContext !== "run") {
    addOptional(
      optionalReminders,
      "Add shoes or gear notes if relevant.",
      hasGear(summary),
    );
    addOptional(
      optionalReminders,
      "Add fatigue if it would affect tomorrow's training.",
      hasNumber(summary.dailyNote?.fatigue),
    );
  }

  addOptional(
    optionalReminders,
    "Add fueling/hydration notes if relevant.",
    hasText(summary.journalEntry?.hydration) ||
      hasText(summary.journalEntry?.fueling) ||
      summary.activityNotes.some((note) => hasText(note.fuelingHydrationNotes)),
  );
  addOptional(
    optionalReminders,
    "Add stress or motivation if they affected the day.",
    hasNumber(summary.dailyNote?.stress) ||
      hasNumber(summary.dailyNote?.motivation),
  );
  addOptional(
    optionalReminders,
    "Add questions for the coach if you want a specific decision.",
    hasText(summary.journalEntry?.questionsForCoach),
  );

  const manualOnlyActivityReminder =
    summary.manualActivities.filter((activity) => activity.source === "journal")
      .length === 0
      ? "Manual-only activities are not detected from exports. Add climbing, weights, tennis, mobility, or other untracked activity if they happened."
      : null;

  return {
    status:
      missingHighValueFields.length === 0
        ? "complete"
        : "needs_subjective_details",
    activityContext,
    missingHighValueFields,
    optionalReminders,
    manualOnlyActivityReminder,
  };
}

function addMissing(fields: string[], field: string, present: boolean): void {
  if (!present) {
    fields.push(field);
  }
}

function addOptional(
  reminders: string[],
  reminder: string,
  alreadyProvided: boolean,
): void {
  if (!alreadyProvided) {
    reminders.push(reminder);
  }
}

function hasNumber(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function hasGear(summary: Omit<DailySummary, "checkInCompleteness">): boolean {
  return (
    hasText(summary.journalEntry?.shoes) ||
    hasText(summary.journalEntry?.equipment) ||
    hasText(summary.journalEntry?.gearOtherNotes) ||
    summary.activityNotes.some((note) => hasText(note.gear))
  );
}

function hasText(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return normalized !== "" && !PLACEHOLDER_VALUES.has(normalized);
}
