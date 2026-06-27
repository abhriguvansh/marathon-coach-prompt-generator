import type {
  ActivityNote,
  AthleteConfig,
  DailyNote,
  DailySummary,
  ManualActivity,
  MissingDataFlag,
  SafetyFlag,
} from "../types";
import { daysUntilRace, formatDate, parseDate } from "../utils/dates";

const RUN_TYPES = new Set(["run"]);
const WALK_TYPES = new Set(["walk", "hike"]);
const WEIGHTS_TYPES = new Set(["weights", "strength"]);

export function previousDate(date: string): string {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return formatDate(parsed);
}

export function createDailySummary(input: {
  date: string;
  athleteConfig: AthleteConfig;
  dailyNotes: DailyNote[];
  activityNotes: ActivityNote[];
  manualActivities: ManualActivity[];
  planNotes: string | null;
  missingFiles?: string[];
}): DailySummary {
  const evidenceDate = previousDate(input.date);
  const dailyNote =
    input.dailyNotes.find((note) => note.date === evidenceDate) ?? null;
  const activityNotes = input.activityNotes.filter(
    (note) => note.date === evidenceDate,
  );
  const manualActivities = input.manualActivities.filter(
    (activity) => activity.date === evidenceDate,
  );

  const runs = manualActivities.filter((activity) =>
    RUN_TYPES.has(normalizeActivityType(activity.activityType)),
  );
  const walks = manualActivities.filter((activity) =>
    WALK_TYPES.has(normalizeActivityType(activity.activityType)),
  );
  const rockClimbing = manualActivities.filter(
    (activity) =>
      normalizeActivityType(activity.activityType) === "rock_climbing",
  );
  const tennis = manualActivities.filter(
    (activity) => normalizeActivityType(activity.activityType) === "tennis",
  );
  const weights = manualActivities.filter((activity) =>
    WEIGHTS_TYPES.has(normalizeActivityType(activity.activityType)),
  );
  const mobility = manualActivities.filter(
    (activity) => normalizeActivityType(activity.activityType) === "mobility",
  );
  const restOrOther = manualActivities.filter((activity) => {
    const type = normalizeActivityType(activity.activityType);

    return type === "rest" || type === "other";
  });

  const runningMileage = sumMileage(runs);
  const walkingMileage = sumMileage(walks);

  return {
    date: input.date,
    evidenceDate,
    athleteConfig: input.athleteConfig,
    dailyNote,
    activityNotes,
    manualActivities,
    planNotes: input.planNotes,
    daysUntilRace: daysUntilRace(
      parseDate(input.date),
      parseDate(input.athleteConfig.race.date),
    ),
    runningMileage,
    walkingMileage,
    runs,
    walks,
    rockClimbing,
    tennis,
    weights,
    mobility,
    restOrOther,
    safetyFlags: buildSafetyFlags(dailyNote, activityNotes),
    missingDataFlags: buildMissingDataFlags({
      dailyNote,
      manualActivities,
      activityNotes,
      planNotes: input.planNotes,
      missingFiles: input.missingFiles ?? [],
    }),
  };
}

function normalizeActivityType(activityType: string): string {
  return activityType.trim().toLowerCase();
}

function sumMileage(activities: ManualActivity[]): number {
  return activities.reduce(
    (total, activity) => total + (activity.distanceMiles ?? 0),
    0,
  );
}

function buildSafetyFlags(
  dailyNote: DailyNote | null,
  activityNotes: ActivityNote[],
): SafetyFlag[] {
  const flags: SafetyFlag[] = [];

  if (!dailyNote) {
    return flags;
  }

  if (dailyNote.pain !== null && dailyNote.pain >= 4) {
    flags.push({
      level: "concern",
      message: `Pain is ${dailyNote.pain}/10, which meets the concern threshold.`,
    });
  }

  if (containsConcern(dailyNote.painType, ["sharp"])) {
    flags.push({ level: "concern", message: "Pain type includes sharp pain." });
  }

  if (containsConcern(dailyNote.painLocation, ["left", "right", "one-sided"])) {
    flags.push({
      level: "concern",
      message: "Pain location may be one-sided.",
    });
  }

  if (dailyNote.gaitChanged === true) {
    flags.push({
      level: "concern",
      message: "Gait changed is marked true.",
    });
  }

  const notes = [
    dailyNote.notes,
    ...activityNotes.map((activityNote) => activityNote.painNotes),
  ]
    .filter((value): value is string => value !== null)
    .join(" ");

  if (containsConcern(notes, ["worse", "worsening", "increasing"])) {
    flags.push({
      level: "concern",
      message: "Notes suggest pain may be worsening.",
    });
  }

  return flags;
}

function containsConcern(value: string | null, terms: string[]): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();

  return terms.some((term) => normalized.includes(term));
}

function buildMissingDataFlags(input: {
  dailyNote: DailyNote | null;
  manualActivities: ManualActivity[];
  activityNotes: ActivityNote[];
  planNotes: string | null;
  missingFiles: string[];
}): MissingDataFlag[] {
  const flags: MissingDataFlag[] = [];

  for (const missingFile of input.missingFiles) {
    flags.push({
      field: missingFile,
      message: `Missing local input file: ${missingFile}. Copy the matching template file before adding real data.`,
    });
  }

  if (!input.dailyNote) {
    flags.push({
      field: "daily-notes.csv",
      message: "No daily note found for yesterday.",
    });
  }

  if (input.manualActivities.length === 0) {
    flags.push({
      field: "manual-activities.csv",
      message: "No manual activities found for yesterday.",
    });
  }

  if (input.activityNotes.length === 0) {
    flags.push({
      field: "activity-notes.csv",
      message: "No activity notes found for yesterday.",
    });
  }

  if (!input.planNotes) {
    flags.push({
      field: "plan-notes.md",
      message: "Plan notes were not provided.",
    });
  }

  return flags;
}
