import type { DailyNote, ManualActivity } from "../types";
import {
  addDays,
  formatDate,
  isDateWithinRange,
  parseDate,
} from "../utils/dates";
import { formatPace } from "../utils/pace";
import {
  formatRecoveryValue,
  isNoPain,
  numericRecoveryValue,
} from "../utils/recovery";
import { isHighStepDay, numericStepCount } from "../utils/steps";
import { secondsToReadableDuration } from "../utils/units";
import {
  classifyActivities,
  normalizeActivityType,
  sumMileage,
} from "./activity-classification";
import { analyzeActivityDuplicates } from "./duplicate-detection";

export function buildRecentCoachingContext(input: {
  evidenceDate: string;
  dailyNotes: DailyNote[];
  manualActivities: ManualActivity[];
}): string[] {
  const evidence = parseDate(input.evidenceDate);
  const last7Start = formatDate(addDays(evidence, -6));
  const last14Start = formatDate(addDays(evidence, -13));
  const previous7Start = last14Start;
  const previous7End = formatDate(addDays(evidence, -7));

  const last7Notes = filterNotes(
    input.dailyNotes,
    last7Start,
    input.evidenceDate,
  );
  const last14Notes = filterNotes(
    input.dailyNotes,
    last14Start,
    input.evidenceDate,
  );
  const last7Activities = activitiesForTotals(
    filterActivities(input.manualActivities, last7Start, input.evidenceDate),
  );
  const last14Activities = activitiesForTotals(
    filterActivities(input.manualActivities, last14Start, input.evidenceDate),
  );
  const previous7Activities = activitiesForTotals(
    filterActivities(input.manualActivities, previous7Start, previous7End),
  );

  if (
    last7Notes.length === 0 &&
    last7Activities.length === 0 &&
    last14Activities.length === 0
  ) {
    return [
      "- Recent context limited: not enough prior activity or journal data found.",
    ];
  }

  const bullets = [
    last7Summary(last7Activities, last7Notes),
    last14Trend(last7Activities, previous7Activities, last14Activities),
    recoveryTrend(last14Notes),
    lastRunSummary(last14Activities, input.dailyNotes),
    loadNote(last7Activities, last7Notes),
  ].filter((line): line is string => line !== null);

  return bullets.length === 0
    ? [
        "- Recent context limited: not enough prior activity or journal data found.",
      ]
    : bullets.slice(0, 7).map((line) => `- ${line}`);
}

function filterNotes(
  notes: DailyNote[],
  startDate: string,
  endDate: string,
): DailyNote[] {
  return notes
    .filter((note) => isDateWithinRange(note.date, startDate, endDate))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function filterActivities(
  activities: ManualActivity[],
  startDate: string,
  endDate: string,
): ManualActivity[] {
  return activities
    .filter((activity) => isDateWithinRange(activity.date, startDate, endDate))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function activitiesForTotals(activities: ManualActivity[]): ManualActivity[] {
  return analyzeActivityDuplicates(activities).activitiesForTotals;
}

function last7Summary(
  activities: ManualActivity[],
  notes: DailyNote[],
): string {
  const groups = classifyActivities(activities);
  const runningMileage = sumMileage(groups.runs);
  const walkingMileage = sumMileage(groups.walks);
  const longestRun = longestByDistance(groups.runs);
  const highStepDays = notes.filter((note) => isHighStepDay(note.totalSteps));
  const restDays = notes.filter(
    (note) => !activities.some((activity) => activity.date === note.date),
  );
  const parts = [
    `${groups.runs.length} run day${plural(groups.runs.length)}`,
    `${formatMiles(runningMileage)} running`,
    longestRun === null ? null : `longest run ${formatMiles(longestRun)}`,
    groups.walks.length === 0
      ? null
      : `${groups.walks.length} tracked walk${plural(groups.walks.length)}`,
    walkingMileage > 0 ? `${formatMiles(walkingMileage)} walking` : null,
    highStepDays.length === 0
      ? null
      : `${highStepDays.length} high-step day${plural(highStepDays.length)}`,
    groups.rockClimbing.length === 0
      ? null
      : `${groups.rockClimbing.length} climbing session${plural(
          groups.rockClimbing.length,
        )}`,
    groups.tennis.length === 0
      ? null
      : `${groups.tennis.length} tennis session${plural(groups.tennis.length)}`,
    groups.weights.length === 0
      ? null
      : `${groups.weights.length} strength session${plural(
          groups.weights.length,
        )}`,
    groups.mobility.length === 0
      ? null
      : `${groups.mobility.length} mobility session${plural(
          groups.mobility.length,
        )}`,
    restDays.length === 0
      ? null
      : `${restDays.length} journaled rest day${plural(restDays.length)}`,
  ].filter((part): part is string => part !== null);

  return `Last 7 days: ${parts.join("; ")}. Steps are load context, not walking mileage.`;
}

function last14Trend(
  recent7Activities: ManualActivity[],
  previous7Activities: ManualActivity[],
  last14Activities: ManualActivity[],
): string {
  const last14Groups = classifyActivities(last14Activities);
  const recentRunning = sumMileage(classifyActivities(recent7Activities).runs);
  const previousRunning = sumMileage(
    classifyActivities(previous7Activities).runs,
  );
  const runCount = last14Groups.runs.length;
  const walkingMileage = sumMileage(last14Groups.walks);
  const crossTrainingCount =
    last14Groups.rockClimbing.length +
    last14Groups.tennis.length +
    last14Groups.weights.length +
    last14Groups.mobility.length;

  if (recentRunning === 0 && previousRunning === 0) {
    const context =
      walkingMileage > 0 || crossTrainingCount > 0
        ? "mostly walking or cross-training"
        : "limited activity data";

    return `Last 14 days: running volume is limited; recent context is ${context}.`;
  }

  if (runCount < 3) {
    return limitedRunHistoryTrend(recentRunning, previousRunning);
  }

  if (previousRunning === 0 && recentRunning > 0) {
    return `Last 14 days: running volume is building from little or no prior-week running.`;
  }

  if (recentRunning > previousRunning * 1.25 + 0.5) {
    return `Last 14 days: running volume increased versus the prior 7 days (${formatMiles(
      recentRunning,
    )} vs ${formatMiles(previousRunning)}).`;
  }

  if (recentRunning < previousRunning * 0.75 - 0.5) {
    return `Last 14 days: running volume was more limited than the prior 7 days (${formatMiles(
      recentRunning,
    )} vs ${formatMiles(previousRunning)}).`;
  }

  return `Last 14 days: running volume looks roughly stable (${formatMiles(
    recentRunning,
  )} recent vs ${formatMiles(previousRunning)} prior).`;
}

function limitedRunHistoryTrend(
  recentRunning: number,
  previousRunning: number,
): string {
  if (previousRunning === 0) {
    return "Last 14 days: limited running history, so trend confidence is low.";
  }

  const difference = recentRunning - previousRunning;

  if (Math.abs(difference) <= Math.max(0.5, previousRunning * 0.15)) {
    return "Last 14 days: limited running history; recent run distance is similar to the prior baseline.";
  }

  if (difference > 0) {
    return "Last 14 days: limited running history; recent run distance is slightly higher than the prior baseline.";
  }

  return "Last 14 days: limited running history; recent run distance is lower than the prior baseline.";
}

function recoveryTrend(notes: DailyNote[]): string | null {
  const recoveryNotes = notes.filter(hasRecoverySignal);

  if (recoveryNotes.length < 2) {
    return "Recent recovery trend: limited journal data, so interpret load cautiously.";
  }

  const first = recoveryNotes[0];
  const last = recoveryNotes[recoveryNotes.length - 1];
  const firstSoreness = numericRecoveryValue(first.legSoreness);
  const lastSoreness = numericRecoveryValue(last.legSoreness);
  const painReports = recoveryNotes.filter(hasPainSignal);
  const gaitReports = recoveryNotes.filter(hasGaitConcern);
  const missingDays = notes.length < 7 ? 7 - notes.length : 0;
  const limitation =
    missingDays > 2
      ? ` Journal coverage is partial (${notes.length}/7 recent days).`
      : "";

  if (painReports.length > 0 || gaitReports.length > 0) {
    return `Recent recovery trend: caution signal present (${painReports.length} pain report${plural(
      painReports.length,
    )}, ${gaitReports.length} gait concern${plural(gaitReports.length)}).${limitation}`;
  }

  if (firstSoreness !== null && lastSoreness !== null) {
    if (lastSoreness <= firstSoreness - 1) {
      return `Recent recovery trend: improving soreness (${formatRecoveryValue(
        first.legSoreness,
      )} to ${formatRecoveryValue(last.legSoreness)}), with no pain/gait concern reported.${limitation}`;
    }

    if (lastSoreness >= firstSoreness + 1) {
      return `Recent recovery trend: soreness increased (${formatRecoveryValue(
        first.legSoreness,
      )} to ${formatRecoveryValue(last.legSoreness)}), with no pain/gait concern reported.${limitation}`;
    }
  }

  return `Recent recovery trend: stable from available notes, with no pain/gait concern reported.${limitation}`;
}

function lastRunSummary(
  activities: ManualActivity[],
  notes: DailyNote[],
): string | null {
  const runs = classifyActivities(activities).runs;
  const lastRun = runs.sort(compareActivityDateDescending)[0];

  if (!lastRun) {
    return null;
  }

  const recoveryResponse = recoveryResponseForRun(lastRun, notes);
  const routeNote = requiresRouteOmissionNote(lastRun)
    ? " Route details omitted."
    : "";

  return [
    `Last run: ${lastRun.date}, ${activityDistance(lastRun)}, ${activityDuration(
      lastRun,
    )}`,
    activityPace(lastRun),
    recoveryResponse,
  ]
    .filter((part): part is string => part !== null)
    .join(", ")
    .concat(`.${routeNote}`);
}

function loadNote(
  activities: ManualActivity[],
  notes: DailyNote[],
): string | null {
  const highStepNotes = notes.filter((note) => isHighStepDay(note.totalSteps));
  const groups = classifyActivities(activities);
  const runs = groups.runs;
  const nearbyLoadActivities = [
    ...groups.rockClimbing.map((activity) => ({
      date: activity.date,
      label: "climbing",
    })),
    ...groups.weights.map((activity) => ({
      date: activity.date,
      label: "strength",
    })),
    ...groups.tennis.map((activity) => ({
      date: activity.date,
      label: "tennis",
    })),
  ];
  const datedLoadNotes = [
    ...nearbyLoadActivities.flatMap((activity) =>
      nearbyRuns(activity.date, runs).map(
        (run) =>
          `${activity.label} on ${activity.date} ${timingPhrase(
            activity.date,
            run.date,
          )} the ${run.date} run`,
      ),
    ),
    ...highStepNotes.flatMap((note) =>
      nearbyRuns(note.date, runs).map((run) => {
        const steps = numericStepCount(note.totalSteps);

        return `${formatStepCount(steps)} steps on ${note.date} ${timingPhrase(
          note.date,
          run.date,
        )} the ${run.date} run`;
      }),
    ),
  ];

  if (datedLoadNotes.length > 0) {
    return `Load note: ${dedupe(datedLoadNotes)
      .slice(0, 2)
      .join("; ")}; treat it as additional musculoskeletal load.`;
  }

  if (highStepNotes.length > 0) {
    const maxSteps = Math.max(
      ...highStepNotes
        .map((note) => numericStepCount(note.totalSteps))
        .filter((value): value is number => value !== null),
    );

    return `Load note: highest recent step day was about ${Math.round(
      maxSteps,
    ).toLocaleString("en-US")} steps; steps are load, not walking mileage.`;
  }

  return null;
}

function nearbyRuns(date: string, runs: ManualActivity[]): ManualActivity[] {
  return runs.filter((run) => daysBetween(date, run.date) <= 2);
}

function daysBetween(left: string, right: string): number {
  return Math.round(
    Math.abs(parseDate(left).getTime() - parseDate(right).getTime()) /
      86_400_000,
  );
}

function timingPhrase(loadDate: string, runDate: string): string {
  const loadTime = parseDate(loadDate).getTime();
  const runTime = parseDate(runDate).getTime();
  const days = daysBetween(loadDate, runDate);

  if (days === 0) {
    return "occurred on the same day as";
  }

  if (loadTime < runTime) {
    return days === 1 ? "occurred the day before" : "occurred two days before";
  }

  return days === 1 ? "added recovery load after" : "occurred two days after";
}

function formatStepCount(steps: number | null): string {
  if (steps === null) {
    return "High-step";
  }

  if (steps >= 10_000 && steps % 1000 === 0) {
    return `${Math.round(steps / 1000)}k`;
  }

  return Math.round(steps).toLocaleString("en-US");
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function recoveryResponseForRun(
  run: ManualActivity,
  notes: DailyNote[],
): string | null {
  const sameDay = notes.find((note) => note.date === run.date);
  const nextDay = notes.find(
    (note) => note.date === formatDate(addDays(parseDate(run.date), 1)),
  );
  const response = nextDay ?? sameDay;

  if (!response || !hasRecoverySignal(response)) {
    return null;
  }

  return `recovery response ${[
    `soreness ${formatRecoveryValue(response.legSoreness, "unknown")}`,
    `pain ${formatRecoveryValue(response.pain, "unknown")}`,
    `gait ${formatRecoveryValue(response.gaitChanged, "unknown")}`,
  ].join("; ")}`;
}

function hasRecoverySignal(note: DailyNote): boolean {
  return (
    numericRecoveryValue(note.legSoreness) !== null ||
    numericRecoveryValue(note.pain) !== null ||
    typeof note.legSoreness === "string" ||
    typeof note.pain === "string" ||
    note.gaitChanged !== null ||
    numericRecoveryValue(note.fatigue) !== null ||
    typeof note.fatigue === "string" ||
    numericRecoveryValue(note.energy) !== null ||
    typeof note.energy === "string"
  );
}

function hasPainSignal(note: DailyNote): boolean {
  const numericPain = numericRecoveryValue(note.pain);

  if (numericPain !== null) {
    return numericPain > 0;
  }

  return !isNoPain(note.pain);
}

function hasGaitConcern(note: DailyNote): boolean {
  if (note.gaitChanged === true) {
    return true;
  }

  if (typeof note.gaitChanged !== "string") {
    return false;
  }

  return /\byes\b|\bchanged\b|\baltered\b|\blimp/i.test(note.gaitChanged);
}

function compareActivityDateDescending(
  left: ManualActivity,
  right: ManualActivity,
): number {
  const dateCompare = right.date.localeCompare(left.date);

  if (dateCompare !== 0) {
    return dateCompare;
  }

  return (right.startTime ?? "").localeCompare(left.startTime ?? "");
}

function longestByDistance(activities: ManualActivity[]): number | null {
  const distances = activities
    .map((activity) => activity.distanceMiles)
    .filter((distance): distance is number => distance !== null);

  return distances.length === 0 ? null : Math.max(...distances);
}

function activityDistance(activity: ManualActivity): string {
  return activity.distanceMiles === null
    ? "distance unknown"
    : `${formatMiles(activity.distanceMiles)} mi`;
}

function activityDuration(activity: ManualActivity): string {
  if (
    activity.elapsedTimeSeconds !== null &&
    activity.elapsedTimeSeconds !== undefined
  ) {
    return `${secondsToReadableDuration(activity.elapsedTimeSeconds)} elapsed`;
  }

  if (activity.durationMinutes !== null) {
    return secondsToReadableDuration(activity.durationMinutes * 60);
  }

  return "duration unknown";
}

function activityPace(activity: ManualActivity): string | null {
  if (activity.paceMinPerMile !== null) {
    return `${activity.paceMinPerMile} min/mi`;
  }

  if (activity.distanceMiles !== null && activity.durationMinutes !== null) {
    return formatPace((activity.durationMinutes * 60) / activity.distanceMiles);
  }

  return null;
}

function requiresRouteOmissionNote(activity: ManualActivity): boolean {
  const source = activity.source.toLowerCase();
  const type = normalizeActivityType(activity.activityType);

  return (
    source.includes("export") ||
    source.includes("fit") ||
    source.includes("strava") ||
    source.includes("garmin") ||
    type.includes("run") ||
    type.includes("walk")
  );
}

function formatMiles(miles: number): string {
  return Number(miles.toFixed(2)).toString();
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
