import type { CheckInCompleteness, DailySummary } from "../types";
import { isNoPain, isProvidedRecoveryValue } from "../utils/recovery";
import { isProvidedStepValue, stepApprox } from "../utils/steps";

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
    isProvidedRecoveryValue(summary.dailyNote?.legSoreness, {
      allowNone: true,
    }),
  );
  addMissing(
    missingHighValueFields,
    "pain",
    isProvidedRecoveryValue(summary.dailyNote?.pain, { allowNone: true }),
  );
  addMissing(missingHighValueFields, "gait changed", isProvidedGait(summary));
  addMissing(
    missingHighValueFields,
    "energy",
    isProvidedRecoveryValue(summary.dailyNote?.energy),
  );
  addMissing(
    missingHighValueFields,
    "steps",
    summary.dailyNote !== null &&
      (stepApprox(summary.dailyNote) !== null ||
        isProvidedStepValue(summary.dailyNote.totalSteps)),
  );
  addMissing(
    missingHighValueFields,
    "sleep",
    isProvidedRecoveryValue(summary.dailyNote?.sleepQuality) ||
      summary.dailyNote?.sleepDurationMinutes != null ||
      summary.dailyNote?.sleepScore != null,
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
      isProvidedRecoveryValue(summary.dailyNote?.fatigue, { allowNone: true }),
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
      isProvidedRecoveryValue(summary.dailyNote?.fatigue, { allowNone: true }),
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
    isProvidedRecoveryValue(summary.dailyNote?.stress) ||
      isProvidedRecoveryValue(summary.dailyNote?.motivation),
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

function isProvidedGait(
  summary: Omit<DailySummary, "checkInCompleteness">,
): boolean {
  const gaitChanged = summary.dailyNote?.gaitChanged;

  if (typeof gaitChanged === "boolean") {
    return true;
  }

  if (
    isNoPain(summary.dailyNote?.pain) &&
    isProvidedRecoveryValue(gaitChanged)
  ) {
    return true;
  }

  return isProvidedRecoveryValue(gaitChanged, { allowNotApplicable: false });
}

const PLACEHOLDER_VALUES = new Set([
  "not provided",
  "unknown",
  "n/a",
  "na",
  "none provided",
  "tbd",
  "todo",
  "fill in",
  "placeholder",
]);
