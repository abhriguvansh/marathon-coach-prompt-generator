import type {
  DailyNote,
  ManualActivity,
  RecoveryTrendFlags,
  RecoveryValue,
} from "../types";
import {
  addDays,
  formatDate,
  isDateWithinRange,
  parseDate,
} from "../utils/dates";
import { isHighStepNote } from "../utils/steps";
import { classifyActivities } from "./activity-classification";

type TrendLabel =
  | "improving"
  | "stable"
  | "controlled"
  | "worsening"
  | "fluctuating"
  | "limited context";

interface TrendPoint {
  date: string;
  value: number;
  original: RecoveryValue;
}

export function buildDailyRecoveryTrendFlags(input: {
  evidenceDate: string;
  dailyNotes: DailyNote[];
  manualActivities: ManualActivity[];
}): RecoveryTrendFlags {
  const evidence = parseDate(input.evidenceDate);
  const last7Start = formatDate(addDays(evidence, -6));
  const last14Start = formatDate(addDays(evidence, -13));
  const last7Notes = notesInRange(
    input.dailyNotes,
    last7Start,
    input.evidenceDate,
  );
  const backupNotes = notesInRange(
    input.dailyNotes,
    last14Start,
    input.evidenceDate,
  );
  const notesForTrends =
    countValues(last7Notes, "legSoreness", "soreness") >= 2 ||
    countValues(last7Notes, "pain", "pain") >= 2
      ? last7Notes
      : backupNotes;
  const activities = input.manualActivities.filter((activity) =>
    isDateWithinRange(activity.date, last7Start, input.evidenceDate),
  );

  return buildRecoveryTrendFlags({
    notes: notesForTrends,
    coverageDays: last7Notes.length,
    expectedDays: 7,
    activities,
    dailyMode: true,
  });
}

export function buildWeeklyRecoveryTrendFlags(input: {
  dailyNotes: DailyNote[];
  manualActivities: ManualActivity[];
}): RecoveryTrendFlags {
  return buildRecoveryTrendFlags({
    notes: input.dailyNotes,
    coverageDays: input.dailyNotes.length,
    expectedDays: 7,
    activities: input.manualActivities,
    dailyMode: false,
  });
}

function buildRecoveryTrendFlags(input: {
  notes: DailyNote[];
  coverageDays: number;
  expectedDays: number;
  activities: ManualActivity[];
  dailyMode: boolean;
}): RecoveryTrendFlags {
  const pain = trendFor(input.notes, "pain", "pain");
  const gait = gaitSummary(input.notes);
  const soreness = adjustSorenessTrend(
    trendFor(input.notes, "legSoreness", "soreness"),
    input.notes,
    pain,
    gait,
  );
  const loadNote = loadRecoveryNote(
    input.notes,
    input.activities,
    soreness,
    pain,
    gait,
  );
  const sorenessWarmup = sorenessWarmupNote(input.notes);
  const painDetail = painDetailNote(input.notes, pain);
  const partialCoverage = input.coverageDays < input.expectedDays;
  const bullets = [
    sorenessBullet(soreness, input.dailyMode),
    painBullet(pain, input.dailyMode),
    gait.bullet,
    sorenessWarmup,
    painDetail,
    loadNote,
    partialCoverage
      ? `Note: journal coverage is partial (${input.coverageDays}/${input.expectedDays}), so trend confidence is limited.`
      : input.dailyMode
        ? null
        : `Coverage: ${input.coverageDays}/${input.expectedDays} journal days available.`,
  ].filter((bullet): bullet is string => bullet !== null);

  return {
    bullets: bullets.slice(0, input.dailyMode ? 6 : 5),
    hasCaution:
      soreness.label === "worsening" ||
      pain.label === "worsening" ||
      pain.newPain ||
      gait.hasCaution ||
      loadNote?.startsWith(
        "Load/recovery note: higher total load coincided",
      ) === true ||
      sorenessWarmup?.startsWith("Caution:") === true,
  };
}

function notesInRange(
  notes: DailyNote[],
  startDate: string,
  endDate: string,
): DailyNote[] {
  return notes
    .filter((note) => isDateWithinRange(note.date, startDate, endDate))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function countValues(
  notes: DailyNote[],
  key: "legSoreness" | "pain",
  metric: "soreness" | "pain",
): number {
  return pointsFor(notes, key, metric).length;
}

function trendFor(
  notes: DailyNote[],
  key: "legSoreness" | "pain",
  metric: "soreness" | "pain",
) {
  const points = pointsFor(notes, key, metric);

  if (points.length < 2) {
    return {
      label: "limited context" as TrendLabel,
      points,
      newPain: false,
    };
  }

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const values = points.map((point) => point.value);
  const range = Math.max(...values) - Math.min(...values);
  const previousValues = values.slice(0, -1);
  const newPain =
    metric === "pain" &&
    last > 0 &&
    previousValues.length > 0 &&
    previousValues.every((value) => value === 0);

  if (newPain) {
    return { label: "worsening" as TrendLabel, points, newPain };
  }

  if (last <= first - 1) {
    return { label: "improving" as TrendLabel, points, newPain };
  }

  if (last >= first + 1) {
    return { label: "worsening" as TrendLabel, points, newPain };
  }

  if (range >= 2) {
    return { label: "fluctuating" as TrendLabel, points, newPain };
  }

  return { label: "stable" as TrendLabel, points, newPain };
}

function adjustSorenessTrend(
  trend: ReturnType<typeof trendFor>,
  notes: DailyNote[],
  pain: ReturnType<typeof trendFor>,
  gait: { hasCaution: boolean },
): ReturnType<typeof trendFor> {
  if (trend.label !== "worsening" || !isLowControlledIncrease(trend.points)) {
    return trend;
  }

  if (hasSorenessRiskContext(notes, pain, gait)) {
    return trend;
  }

  return {
    ...trend,
    label: "controlled" as TrendLabel,
  };
}

function isLowControlledIncrease(points: TrendPoint[]): boolean {
  if (points.length < 2) {
    return false;
  }

  const values = points.map((point) => point.value);
  const first = values[0];
  const lastValue = values[values.length - 1];
  const max = Math.max(...values);

  return first <= 1 && lastValue <= 1 && max <= 1 && lastValue - first <= 1;
}

function hasSorenessRiskContext(
  notes: DailyNote[],
  pain: ReturnType<typeof trendFor>,
  gait: { hasCaution: boolean },
): boolean {
  return (
    pain.points.some((point) => point.value > 0) ||
    pain.label === "worsening" ||
    pain.newPain ||
    gait.hasCaution ||
    hasUnusualFatigue(notes)
  );
}

function hasUnusualFatigue(notes: DailyNote[]): boolean {
  const latest = notes.at(-1);

  if (!latest) {
    return false;
  }

  const numeric = recoveryNumber(latest.fatigue, "soreness");

  if (numeric !== null) {
    return numeric >= 4;
  }

  if (typeof latest.fatigue !== "string") {
    return false;
  }

  return /\b(unusual fatigue|heavy legs|worsening fatigue|exhausted)\b/i.test(
    latest.fatigue,
  );
}

function pointsFor(
  notes: DailyNote[],
  key: "legSoreness" | "pain",
  metric: "soreness" | "pain",
): TrendPoint[] {
  return notes
    .map((note) => {
      const value = recoveryNumber(note[key], metric);

      return value === null
        ? null
        : { date: note.date, value, original: note[key] };
    })
    .filter((point): point is TrendPoint => point !== null);
}

function recoveryNumber(
  value: RecoveryValue,
  metric: "soreness" | "pain",
): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "") {
    return null;
  }

  if (
    ["none", "no", "0", "0/10", "no pain", "pain 0", "no soreness"].includes(
      normalized,
    )
  ) {
    return 0;
  }

  const natural = naturalLanguageRecoveryNumber(normalized);

  if (natural !== null) {
    return natural;
  }

  const range = normalized.match(
    /(\d+(?:\.\d+)?)\s*(?:-|\/|\bto\b)\s*(\d+(?:\.\d+)?)/,
  );

  if (range) {
    const left = Number(range[1]);
    const right = Number(range[2]);

    return metric === "pain" ? Math.max(left, right) : (left + right) / 2;
  }

  const number = normalized.match(/\d+(?:\.\d+)?/);

  return number ? Number(number[0]) : null;
}

function naturalLanguageRecoveryNumber(value: string): number | null {
  if (
    /\b(no soreness|no pain|none|fine|good|no fatigue problems|normal)\b/.test(
      value,
    )
  ) {
    return 0;
  }

  if (/\b(barely present|barely|very mild)\b/.test(value)) {
    return 1;
  }

  if (/\bmild\b/.test(value)) {
    return 2;
  }

  if (/\bmoderate\b/.test(value)) {
    return 5;
  }

  if (/\b(severe|sharp)\b/.test(value)) {
    return 8;
  }

  return null;
}

function sorenessBullet(
  trend: ReturnType<typeof trendFor>,
  dailyMode: boolean,
): string {
  if (trend.label === "limited context") {
    return "- Soreness trend: limited context.";
  }

  if (trend.label === "improving") {
    return dailyMode
      ? "- Soreness trend: improving across recent entries."
      : `- Soreness: improved from ${formatOriginal(trend.points[0])} to ${formatOriginal(last(trend.points))} across available entries.`;
  }

  if (trend.label === "worsening") {
    return dailyMode
      ? "- Soreness trend: caution - worsening across recent entries."
      : "- Caution: soreness increased across available entries.";
  }

  if (trend.label === "controlled") {
    return dailyMode
      ? "- Soreness trend: mild and controlled; monitor, with no pain/gait concern."
      : "- Soreness: mildly elevated but still low across available entries.";
  }

  if (trend.label === "fluctuating") {
    return dailyMode
      ? "- Soreness trend: fluctuating; avoid assuming full recovery from one good day."
      : "- Soreness: fluctuated across available entries.";
  }

  const max = Math.max(...trend.points.map((point) => point.value));

  return max <= 2
    ? "- Soreness trend: stable and low."
    : "- Soreness trend: stable but present.";
}

function painBullet(
  trend: ReturnType<typeof trendFor>,
  dailyMode: boolean,
): string {
  if (trend.label === "limited context") {
    return "- Pain trend: limited context.";
  }

  if (trend.newPain) {
    return dailyMode
      ? "- Pain trend: caution - pain reported after recent 0s."
      : "- Caution: pain appeared after recent 0s.";
  }

  if (trend.points.every((point) => point.value === 0)) {
    return dailyMode
      ? "- Pain trend: stable at 0."
      : "- Pain: remained 0 in available entries.";
  }

  if (trend.label === "improving") {
    return dailyMode
      ? "- Pain trend: improving."
      : "- Pain: improved across available entries.";
  }

  if (trend.label === "worsening") {
    return dailyMode
      ? "- Pain trend: caution - pain appears to be increasing."
      : "- Caution: pain increased across available entries.";
  }

  if (trend.label === "fluctuating") {
    return "- Pain trend: fluctuating; monitor location and gait.";
  }

  return "- Pain trend: stable but present; monitor location and gait.";
}

function gaitSummary(notes: DailyNote[]): {
  bullet: string;
  hasCaution: boolean;
} {
  const gaitValues = notes
    .map((note) => note.gaitChanged)
    .filter((value) => value !== null);

  if (gaitValues.length === 0) {
    return { bullet: "- Gait: limited context.", hasCaution: false };
  }

  if (gaitValues.some(isPositiveGaitChange)) {
    return {
      bullet: "- Gait: caution - gait change reported recently.",
      hasCaution: true,
    };
  }

  if (gaitValues.every(isNegativeGaitChange)) {
    return { bullet: "- Gait: no changes reported.", hasCaution: false };
  }

  return { bullet: "- Gait: limited context.", hasCaution: false };
}

function isPositiveGaitChange(value: boolean | string): boolean {
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  return /\byes\b|\by\b|\bchanged\b|\baltered\b|\blimp/i.test(value);
}

function isNegativeGaitChange(value: boolean | string): boolean {
  if (value === false) {
    return true;
  }

  if (value === true) {
    return false;
  }

  return /^(no|n|none|normal|na|n\/a|not applicable)$/i.test(value.trim());
}

function sorenessWarmupNote(notes: DailyNote[]): string | null {
  const text = notes
    .map((note) => note.notes)
    .filter((value): value is string => value !== null)
    .join(" ")
    .toLowerCase();

  if (
    /did not warm up|stayed sore during run|got worse during run|soreness increased during run/.test(
      text,
    )
  ) {
    return "- Caution: soreness may not be warming up normally; monitor before next run.";
  }

  if (/warmed up during|soreness improved during/.test(text)) {
    return "- Note: soreness warmed up during the run, which is preferable to worsening during activity.";
  }

  return null;
}

function painDetailNote(
  notes: DailyNote[],
  pain: ReturnType<typeof trendFor>,
): string | null {
  const hasPain = pain.points.some((point) => point.value > 0);

  if (!hasPain) {
    return null;
  }

  const hasDetail = notes.some(
    (note) =>
      meaningfulDetail(note.painLocation) || meaningfulDetail(note.painType),
  );

  return hasDetail
    ? "- Pain detail: location/type provided; use for coaching context without diagnosis."
    : null;
}

function meaningfulDetail(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return !["na", "n/a", "none", "no", "not applicable"].includes(
    value.trim().toLowerCase(),
  );
}

function loadRecoveryNote(
  notes: DailyNote[],
  activities: ManualActivity[],
  soreness: ReturnType<typeof trendFor>,
  pain: ReturnType<typeof trendFor>,
  gait: { hasCaution: boolean },
): string | null {
  if (!hasHigherLoad(notes, activities)) {
    return null;
  }

  if (
    soreness.label === "worsening" ||
    pain.label === "worsening" ||
    gait.hasCaution
  ) {
    return "- Load/recovery note: higher total load coincided with worse recovery; avoid stacking load until stable.";
  }

  if (soreness.label === "controlled") {
    return "- Load/recovery note: higher step/load may add recovery demand; keep the next session easy and monitor soreness.";
  }

  if (pain.points.length >= 2 && soreness.points.length >= 2) {
    return "- Load/recovery note: higher total load did not coincide with worsening pain/gait, but monitor cumulative fatigue.";
  }

  return "- Load/recovery note: higher total load occurred recently; trend confidence is limited.";
}

function hasHigherLoad(
  notes: DailyNote[],
  activities: ManualActivity[],
): boolean {
  if (notes.some((note) => isHighStepNote(note))) {
    return true;
  }

  const dates = new Set(activities.map((activity) => activity.date));

  for (const date of dates) {
    const groups = classifyActivities(
      activities.filter((activity) => activity.date === date),
    );
    const hasRun = groups.runs.length > 0;
    const hasCrossLoad =
      groups.rockClimbing.length > 0 ||
      groups.tennis.length > 0 ||
      groups.weights.length > 0;

    if (hasRun && hasCrossLoad) {
      return true;
    }
  }

  return false;
}

function formatOriginal(point: TrendPoint): string {
  return String(point.original);
}

function last<T>(values: T[]): T {
  return values[values.length - 1];
}
