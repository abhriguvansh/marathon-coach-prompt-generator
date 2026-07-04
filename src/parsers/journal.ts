import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type { DailyNote, JournalEntry, ManualActivity } from "../types";
import { parseOptionalNumber } from "../utils/csv";
import { formatDate, parseDate, todayLocalDate } from "../utils/dates";
import {
  isNoPain,
  parseGaitChangedValue,
  parseRecoveryValue,
} from "../utils/recovery";
import { parseStepDetails } from "../utils/steps";
import { secondsToReadableDuration } from "../utils/units";

export interface JournalInputs {
  dailyNotes: DailyNote[];
  manualActivities: ManualActivity[];
  journalEntries: JournalEntry[];
}

export interface ParsedJournal {
  dailyNote: DailyNote;
  manualActivities: ManualActivity[];
  journalEntry: JournalEntry;
}

export interface CreateJournalResult {
  journalPath: string;
  date: string;
  created: boolean;
  importedActivityCount: number;
}

export interface JournalParseDiagnostics {
  recoveryFieldCount: number;
  coachNotesHasText: boolean;
}

const JOURNAL_FOLDER = "input/journal";
const JOURNAL_TEMPLATE_PATH = "input/journal/template.md";
const DATE_PLACEHOLDER = "{{DATE}}";
const IMPORTED_ACTIVITIES_PLACEHOLDER = "{{IMPORTED_ACTIVITIES}}";

export function loadJournalInputs(cwd = process.cwd()): JournalInputs {
  const folder = join(cwd, JOURNAL_FOLDER);

  if (!existsSync(folder)) {
    return emptyJournalInputs();
  }

  const dailyNotes: DailyNote[] = [];
  const manualActivities: ManualActivity[] = [];
  const journalEntries: JournalEntry[] = [];

  for (const fileName of readdirSync(folder)) {
    const fallbackDate = journalDateFromFileName(fileName);

    if (!fallbackDate) {
      continue;
    }

    const parsed = parseJournal(
      readFileSync(join(folder, fileName), "utf8"),
      fallbackDate,
    );

    dailyNotes.push(parsed.dailyNote);
    manualActivities.push(...parsed.manualActivities);
    journalEntries.push(parsed.journalEntry);
  }

  return { dailyNotes, manualActivities, journalEntries };
}

export function parseJournal(
  content: string,
  fallbackDate?: string,
): ParsedJournal {
  const cleanContent = stripHtmlComments(content);
  const date = fieldValue(cleanContent, "Date") ?? fallbackDate ?? "";
  const recovery = sectionBody(cleanContent, "Recovery");
  const nutrition = sectionBody(cleanContent, "Nutrition");
  const gearNotes = sectionBody(cleanContent, "Gear Notes");
  const coachNotes = freeTextSection(cleanContent, "Coach Notes");
  const questionsForCoach = freeTextSection(
    cleanContent,
    "Questions for Coach",
  );
  const journalEntry: JournalEntry = {
    date,
    hydration: fieldValue(nutrition, "Hydration"),
    fueling: fieldValue(nutrition, "Fueling"),
    bodyWeight: fieldValue(nutrition, "Body Weight (optional)"),
    shoes: fieldValue(gearNotes, "Shoes"),
    equipment: fieldValue(gearNotes, "Equipment"),
    gearOtherNotes: fieldValue(gearNotes, "Other Notes"),
    workoutStructure: fieldValue(cleanContent, "Workout Structure"),
    runWalkFormat: fieldValue(cleanContent, "Run/Walk Format"),
    coachNotes,
    questionsForCoach,
  };
  const pain = parseRecoveryValue(
    fieldValue(recovery, "Pain (0-10 or words)") ??
      fieldValue(recovery, "Pain (0-10)"),
    { allowNone: true },
  );
  const noPain = isNoPain(pain);
  const steps = parseStepDetails(
    fieldValueAny(recovery, [
      "Total Steps",
      "Steps",
      "Daily Steps",
      "Step Count",
    ]),
  );

  return {
    dailyNote: {
      date,
      totalSteps: steps.display,
      stepsDisplay: steps.display,
      stepsApprox: steps.approx,
      stepsSource: steps.display === null ? null : "journal_manual",
      legSoreness: parseRecoveryValue(
        fieldValue(recovery, "Soreness (0-10 or words)") ??
          fieldValue(recovery, "Soreness (0-10)"),
      ),
      pain,
      painLocation: parseRecoveryText(fieldValue(recovery, "Pain Location"), {
        allowNone: noPain,
        allowNotApplicable: noPain,
      }),
      painType: parseRecoveryText(fieldValue(recovery, "Pain Type"), {
        allowNone: noPain,
        allowNotApplicable: noPain,
      }),
      gaitChanged: parseGaitChangedValue(
        fieldValue(recovery, "Did pain change gait? (Yes/No)"),
        pain,
      ),
      fatigue: parseRecoveryValue(
        fieldValue(recovery, "Fatigue (0-10 or words)") ??
          fieldValue(recovery, "Fatigue (0-10)"),
        { allowNone: true },
      ),
      energy: parseRecoveryValue(
        fieldValue(recovery, "Energy (0-10 or words)") ??
          fieldValue(recovery, "Energy (0-10)"),
      ),
      sleepQuality: parseRecoveryValue(fieldValue(recovery, "Sleep")),
      sleepDuration: fieldValue(recovery, "Sleep Duration"),
      sleepDurationMinutes: parseSleepDurationMinutes(
        fieldValue(recovery, "Sleep Duration"),
      ),
      sleepScore: parseWellnessNumber(fieldValue(recovery, "Sleep Score")),
      sleepQualityDetail: fieldValue(recovery, "Sleep Quality"),
      deepSleepDuration: fieldValue(recovery, "Deep Sleep Duration"),
      lightSleepDuration: fieldValue(recovery, "Light Sleep Duration"),
      remDuration: fieldValue(recovery, "REM Duration"),
      awakeDuration: fieldValue(recovery, "Awake Duration"),
      restlessMoments: parseWellnessNumber(
        fieldValue(recovery, "Restless Moments"),
      ),
      restingHeartRate: parseWellnessNumber(
        fieldValue(recovery, "Resting Heart Rate"),
      ),
      averageOvernightHeartRate: parseWellnessNumber(
        fieldValue(recovery, "Average Overnight Heart Rate"),
      ),
      overnightHrv: parseWellnessNumber(fieldValue(recovery, "Overnight HRV")),
      hrvStatus: fieldValue(recovery, "HRV Status"),
      stress: parseRecoveryValue(
        fieldValue(recovery, "Stress (0-10 or words)") ??
          fieldValue(recovery, "Stress (0-10)"),
      ),
      garminStress: parseWellnessNumber(fieldValue(recovery, "Garmin Stress")),
      bodyBattery: fieldValue(recovery, "Body Battery"),
      averageRespiration: parseWellnessNumber(
        fieldValue(recovery, "Average Respiration"),
      ),
      lowestRespiration: parseWellnessNumber(
        fieldValue(recovery, "Lowest Respiration"),
      ),
      averageSpo2: parseWellnessNumber(fieldValue(recovery, "Average SpO2")),
      lowestSpo2: parseWellnessNumber(fieldValue(recovery, "Lowest SpO2")),
      breathingVariations: fieldValue(recovery, "Breathing Variations"),
      motivation: parseRecoveryValue(
        fieldValue(recovery, "Motivation (0-10 or words)") ??
          fieldValue(recovery, "Motivation (0-10)"),
      ),
      notes: combineNotes([
        journalEntry.coachNotes,
        journalEntry.questionsForCoach === null
          ? null
          : `Questions for coach: ${journalEntry.questionsForCoach}`,
      ]),
    },
    manualActivities: parseJournalManualActivities(
      sectionBody(cleanContent, "Manual Activities"),
      date,
    ),
    journalEntry,
  };
}

export function journalParseDiagnostics(
  content: string,
  fallbackDate?: string,
): JournalParseDiagnostics {
  const parsed = parseJournal(content, fallbackDate);
  const note = parsed.dailyNote;
  const recoveryValues = [
    note.legSoreness,
    note.pain,
    note.painLocation,
    note.painType,
    note.gaitChanged,
    note.energy,
    note.fatigue,
    note.sleepQuality,
    note.sleepDuration,
    note.sleepScore,
    note.restingHeartRate,
    note.averageOvernightHeartRate,
    note.overnightHrv,
    note.hrvStatus,
    note.stress,
    note.garminStress,
    note.bodyBattery,
    note.totalSteps,
    parsed.journalEntry.workoutStructure,
  ];

  return {
    recoveryFieldCount: recoveryValues.filter(
      (value) => value !== null && value !== undefined,
    ).length,
    coachNotesHasText:
      parsed.journalEntry.coachNotes !== null &&
      parsed.journalEntry.coachNotes.trim() !== "",
  };
}

export function createJournal(input: {
  cwd?: string;
  date?: string | null;
  importedActivities?: ManualActivity[];
}): CreateJournalResult {
  const cwd = input.cwd ?? process.cwd();
  const date = input.date ?? todayLocalDate();
  parseDate(date);

  const journalPath = join(cwd, JOURNAL_FOLDER, `${date}.md`);
  const importedActivities = (input.importedActivities ?? []).filter(
    (activity) => activity.date === date,
  );

  if (existsSync(journalPath)) {
    const original = readFileSync(journalPath, "utf8");
    const refreshed = refreshImportedActivitiesSection({
      content: original,
      importedActivities,
    });

    if (refreshed.changed) {
      writeFileSync(journalPath, refreshed.content);
    }

    return {
      journalPath,
      date,
      created: false,
      importedActivityCount: importedActivities.length,
    };
  }

  const content = renderJournalTemplate({
    cwd,
    date,
    importedActivities,
  });

  mkdirSync(dirname(journalPath), { recursive: true });
  writeFileSync(journalPath, content);

  return {
    journalPath,
    date,
    created: true,
    importedActivityCount: importedActivities.length,
  };
}

export function renderJournalTemplate(input: {
  cwd?: string;
  date: string;
  importedActivities: ManualActivity[];
}): string {
  const templatePath = join(input.cwd ?? process.cwd(), JOURNAL_TEMPLATE_PATH);
  const template = existsSync(templatePath)
    ? readFileSync(templatePath, "utf8")
    : defaultJournalTemplate();

  return template
    .replaceAll(DATE_PLACEHOLDER, input.date)
    .replaceAll(
      IMPORTED_ACTIVITIES_PLACEHOLDER,
      renderImportedActivities(input.importedActivities),
    );
}

export function refreshImportedActivitiesSection(input: {
  content: string;
  importedActivities: ManualActivity[];
}): { content: string; changed: boolean } {
  const hadBom = input.content.charCodeAt(0) === 0xfeff;
  const rawContent = hadBom ? input.content.slice(1) : input.content;
  const lineEnding = rawContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = rawContent.split(/\r?\n/);
  const sectionStart = lines.findIndex((line) =>
    /^##\s+Imported Activities \(Reference Only\)\s*$/i.test(line),
  );

  if (sectionStart === -1) {
    return { content: input.content, changed: false };
  }

  const sectionEnd = findNextJournalSection(lines, sectionStart + 1);
  const end = sectionEnd === -1 ? lines.length : sectionEnd;
  const rendered = renderImportedActivities(input.importedActivities).split(
    "\n",
  );
  const replacement = ["", ...rendered, ""];
  const refreshedLines = [
    ...lines.slice(0, sectionStart + 1),
    ...replacement,
    ...lines.slice(end),
  ];
  const refreshedContent = `${hadBom ? "\ufeff" : ""}${refreshedLines.join(
    lineEnding,
  )}`;

  return {
    content: refreshedContent,
    changed: refreshedContent !== input.content,
  };
}

export function mergeDailyNotesPreferJournal(
  legacyNotes: DailyNote[],
  journalNotes: DailyNote[],
): DailyNote[] {
  const byDate = new Map<string, DailyNote>();

  for (const note of legacyNotes) {
    byDate.set(note.date, note);
  }

  for (const note of journalNotes) {
    byDate.set(note.date, note);
  }

  return [...byDate.values()];
}

function parseJournalManualActivities(
  manualActivitiesSection: string,
  date: string,
): ManualActivity[] {
  const blocks = splitActivityBlocks(manualActivitiesSection);

  return blocks
    .filter((block) => normalizeActivityType(block.name) !== "activity_name")
    .map((block) => {
      const duration = fieldValue(block.body, "Duration");
      const intensity = fieldValue(block.body, "Intensity");
      const notes = fieldValue(block.body, "Notes");

      return {
        date,
        startTime: null,
        source: "journal",
        activityType: normalizeActivityType(block.name),
        distanceMiles: null,
        durationMinutes: parseDurationMinutes(duration),
        paceMinPerMile: null,
        elevationFt: null,
        avgHr: null,
        maxHr: null,
        steps: null,
        notes: combineNotes([
          intensity === null ? null : `Intensity: ${intensity}`,
          notes,
        ]),
      };
    });
}

function parseRecoveryText(
  value: string | null,
  options: { allowNone?: boolean; allowNotApplicable?: boolean },
): string | null {
  const parsed = parseRecoveryValue(value, options);

  return parsed === null ? null : String(parsed);
}

function splitActivityBlocks(
  section: string,
): Array<{ name: string; body: string }> {
  const headingPattern = /^###\s+(.+?)\s*$/gm;
  const matches = [...section.matchAll(headingPattern)];
  const blocks: Array<{ name: string; body: string }> = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const name = match[1].trim();
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = next?.index ?? section.length;
    const body = section.slice(bodyStart, bodyEnd).trim();

    if (name !== "") {
      blocks.push({ name, body });
    }
  }

  return blocks;
}

function renderImportedActivities(activities: ManualActivity[]): string {
  if (activities.length === 0) {
    return "No imported activities found for this date yet.";
  }

  return activities
    .map((activity) => `* ${formatActivity(activity)}`)
    .join("\n");
}

function findNextJournalSection(lines: string[], start: number): number {
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      return index;
    }
  }

  return -1;
}

function formatActivity(activity: ManualActivity): string {
  return [
    titleCaseActivity(activity.activityType),
    activity.distanceMiles === null
      ? null
      : `${Number(activity.distanceMiles.toFixed(2))} mi`,
    formatImportedActivityDuration(activity),
  ]
    .filter((value): value is string => value !== null)
    .join(" - ");
}

function formatImportedActivityDuration(
  activity: ManualActivity,
): string | null {
  if (
    activity.movingTimeSeconds !== null &&
    activity.movingTimeSeconds !== undefined
  ) {
    return `${secondsToReadableDuration(activity.movingTimeSeconds)} moving`;
  }

  if (
    activity.timerTimeSeconds !== null &&
    activity.timerTimeSeconds !== undefined
  ) {
    return `${secondsToReadableDuration(activity.timerTimeSeconds)} timer`;
  }

  if (
    activity.elapsedTimeSeconds !== null &&
    activity.elapsedTimeSeconds !== undefined
  ) {
    return `${secondsToReadableDuration(activity.elapsedTimeSeconds)} elapsed`;
  }

  return activity.durationMinutes === null
    ? null
    : secondsToReadableDuration(activity.durationMinutes * 60);
}

function titleCaseActivity(activityType: string): string {
  return activityType
    .replaceAll("_", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function normalizeActivityType(activityType: string): string {
  return activityType
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseDurationMinutes(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  const bareNumber = trimmed.match(/^\d+(?:\.\d+)?$/);

  if (bareNumber) {
    return Number(bareNumber[0]);
  }

  const clock = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (clock) {
    const first = Number(clock[1]);
    const second = Number(clock[2]);
    const third = clock[3] === undefined ? null : Number(clock[3]);

    if (third !== null) {
      return first * 60 + second + third / 60;
    }

    return first <= 12 ? first * 60 + second : first + second / 60;
  }

  const hours = trimmed.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|h)\b/);
  const minutes = trimmed.match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|m)\b/);

  if (hours || minutes) {
    return (
      (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)
    );
  }

  return null;
}

function parseSleepDurationMinutes(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const hours = value.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minutes = value.match(/(\d+(?:\.\d+)?)\s*m/i);

  if (hours || minutes) {
    return (
      (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)
    );
  }

  const clock = value.match(/^(\d{1,2}):(\d{2})$/);

  if (clock) {
    return Number(clock[1]) * 60 + Number(clock[2]);
  }

  return parseWellnessNumber(value);
}

function parseWellnessNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);

  return match ? Number(match[0]) : null;
}

function fieldValue(content: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(
    new RegExp(`^${escapedLabel}:[ \\t]*(.*)$`, "im"),
  );

  if (!match) {
    return null;
  }

  const value = match[1].trim();

  if (value === "" || value === "---" || looksLikeBlankFieldLabel(value)) {
    return null;
  }

  return value;
}

function fieldValueAny(content: string, labels: string[]): string | null {
  for (const label of labels) {
    const value = fieldValue(content, label);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function looksLikeBlankFieldLabel(value: string): boolean {
  return /^[A-Za-z][A-Za-z /()0-9-]*:$/.test(value);
}

function sectionBody(content: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(
    new RegExp(`^##\\s+${escapedHeading}\\s*$`, "im"),
  );

  if (!match || match.index === undefined) {
    return "";
  }

  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const nextHeading = rest.search(/^##\s+/m);

  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

function freeTextSection(content: string, heading: string): string | null {
  const text = sectionBody(content, heading)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && line !== "---" && line !== "Optional.")
    .join("\n")
    .trim();

  return text === "" ? null : text;
}

function stripHtmlComments(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, "");
}

function combineNotes(values: Array<string | null>): string | null {
  const present = values.filter(
    (value): value is string => value !== null && value.trim() !== "",
  );

  return present.length === 0 ? null : present.join(" ");
}

function journalDateFromFileName(fileName: string): string | null {
  const match = basename(fileName).match(/^(\d{4}-\d{2}-\d{2})\.md$/);

  return match ? match[1] : null;
}

function emptyJournalInputs(): JournalInputs {
  return { dailyNotes: [], manualActivities: [], journalEntries: [] };
}

function defaultJournalTemplate(): string {
  return [
    "# Daily Journal",
    "",
    `Date: ${DATE_PLACEHOLDER}`,
    "",
    "---",
    "",
    "## Imported Activities (Reference Only)",
    "",
    "These activities were imported automatically from Garmin or Strava exports. Do not manually re-enter them under Manual Activities unless the import is missing or incorrect.",
    "",
    IMPORTED_ACTIVITIES_PLACEHOLDER,
    "",
    "---",
    "",
    "## Recovery",
    "",
    "Soreness (0-10 or words):",
    "",
    "Pain (0-10 or words):",
    "",
    "Pain Location:",
    "",
    "Pain Type:",
    "",
    "Did pain change gait? (Yes/No):",
    "",
    "Energy (0-10 or words):",
    "",
    "Fatigue (0-10 or words):",
    "",
    "Sleep:",
    "",
    "Sleep Duration:",
    "",
    "Sleep Score:",
    "",
    "Sleep Quality:",
    "",
    "Deep Sleep Duration:",
    "",
    "Light Sleep Duration:",
    "",
    "REM Duration:",
    "",
    "Awake Duration:",
    "",
    "Restless Moments:",
    "",
    "Resting Heart Rate:",
    "",
    "Average Overnight Heart Rate:",
    "",
    "Overnight HRV:",
    "",
    "HRV Status:",
    "",
    "Stress (0-10 or words):",
    "",
    "Garmin Stress:",
    "",
    "Body Battery:",
    "",
    "Average Respiration:",
    "",
    "Lowest Respiration:",
    "",
    "Average SpO2:",
    "",
    "Lowest SpO2:",
    "",
    "Breathing Variations:",
    "",
    "Total Steps:",
    "",
    "Workout Structure:",
    "",
    "---",
    "",
    "## Manual Activities",
    "",
    "Only include activities that were NOT imported from Garmin or Strava.",
    "",
    "---",
    "",
    "## Nutrition",
    "",
    "Hydration:",
    "",
    "Fueling:",
    "",
    "Body Weight (optional):",
    "",
    "---",
    "",
    "## Gear Notes",
    "",
    "Shoes:",
    "",
    "Equipment:",
    "",
    "Other Notes:",
    "",
    "---",
    "",
    "## Coach Notes",
    "",
    "---",
    "",
    "## Questions for Coach",
    "",
    "Optional.",
    "",
  ].join("\n");
}
