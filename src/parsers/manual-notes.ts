import { existsSync, readFileSync } from "node:fs";
import type { ActivityNote, DailyNote, ManualActivity } from "../types";
import {
  parseCsv,
  parseOptionalBoolean,
  parseOptionalNumber,
  parseOptionalString,
} from "../utils/csv";

export interface ManualInputs {
  dailyNotes: DailyNote[];
  activityNotes: ActivityNote[];
  manualActivities: ManualActivity[];
  planNotes: string | null;
  missingFiles: string[];
}

export function loadManualInputs(paths: {
  dailyNotesPath: string;
  activityNotesPath: string;
  manualActivitiesPath: string;
  planNotesPath: string;
}): ManualInputs {
  const missingFiles = [
    paths.dailyNotesPath,
    paths.activityNotesPath,
    paths.manualActivitiesPath,
    paths.planNotesPath,
  ].filter((path) => !existsSync(path));

  return {
    dailyNotes: existsSync(paths.dailyNotesPath)
      ? parseDailyNotes(readFileSync(paths.dailyNotesPath, "utf8"))
      : [],
    activityNotes: existsSync(paths.activityNotesPath)
      ? parseActivityNotes(readFileSync(paths.activityNotesPath, "utf8"))
      : [],
    manualActivities: existsSync(paths.manualActivitiesPath)
      ? parseManualActivities(readFileSync(paths.manualActivitiesPath, "utf8"))
      : [],
    planNotes: existsSync(paths.planNotesPath)
      ? readFileSync(paths.planNotesPath, "utf8").trim() || null
      : null,
    missingFiles,
  };
}

export function parseDailyNotes(content: string): DailyNote[] {
  return parseCsv(content).map((record) => ({
    date: record.date,
    totalSteps: parseOptionalNumber(record.total_steps),
    legSoreness: parseOptionalNumber(record.leg_soreness_0_10),
    pain: parseOptionalNumber(record.pain_0_10),
    painLocation: parseOptionalString(record.pain_location),
    painType: parseOptionalString(record.pain_type),
    gaitChanged: parseOptionalBoolean(record.gait_changed),
    fatigue: parseOptionalNumber(record.fatigue_0_10),
    energy: parseOptionalNumber(record.energy_0_10),
    sleepQuality: parseOptionalNumber(record.sleep_quality_0_10),
    stress: parseOptionalNumber(record.stress_0_10),
    motivation: parseOptionalNumber(record.motivation_0_10),
    notes: parseOptionalString(record.notes),
  }));
}

export function parseActivityNotes(content: string): ActivityNote[] {
  return parseCsv(content).map((record) => ({
    date: record.date,
    activityType: record.activity_type,
    durationMinutes: parseOptionalNumber(record.duration_minutes),
    intensity: parseOptionalString(record.intensity),
    details: parseOptionalString(record.details),
    sorenessBefore: parseOptionalNumber(record.soreness_before_0_10),
    sorenessAfter: parseOptionalNumber(record.soreness_after_0_10),
    nextMorningSoreness: parseOptionalNumber(record.next_morning_soreness_0_10),
    painNotes: parseOptionalString(record.pain_notes),
    gear: parseOptionalString(record.gear),
    fuelingHydrationNotes: parseOptionalString(record.fueling_hydration_notes),
  }));
}

export function parseManualActivities(content: string): ManualActivity[] {
  return parseCsv(content).map((record) => ({
    date: record.date,
    startTime: null,
    source: record.source,
    activityType: record.activity_type,
    distanceMiles: parseOptionalNumber(record.distance_miles),
    durationMinutes: parseOptionalNumber(record.duration_minutes),
    paceMinPerMile: parseOptionalString(record.pace_min_per_mile),
    elevationFt: parseOptionalNumber(record.elevation_ft),
    avgHr: parseOptionalNumber(record.avg_hr),
    maxHr: parseOptionalNumber(record.max_hr),
    steps: parseOptionalNumber(record.steps),
    notes: parseOptionalString(record.notes),
  }));
}
