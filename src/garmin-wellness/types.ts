export type GarminWellnessMetricSource =
  | "garmin_sleep_csv"
  | "garmin_wellness_zip";

export type GarminStepSource =
  | "garmin_daily_summary"
  | "garmin_cumulative_snapshot"
  | "unavailable";

export type GarminWellnessJournalField =
  | "Sleep"
  | "Sleep Duration"
  | "Sleep Score"
  | "Sleep Quality"
  | "Deep Sleep Duration"
  | "Light Sleep Duration"
  | "REM Duration"
  | "Awake Duration"
  | "Restless Moments"
  | "Resting Heart Rate"
  | "Average Overnight Heart Rate"
  | "Overnight HRV"
  | "HRV Status"
  | "Garmin Stress"
  | "Body Battery"
  | "Average Respiration"
  | "Lowest Respiration"
  | "Average SpO2"
  | "Lowest SpO2"
  | "Breathing Variations"
  | "Total Steps";

export interface GarminWellnessSummary {
  date: string;
  totalSteps: number | null;
  sleepDurationMinutes: number | null;
  sleepScore: number | null;
  sleepQuality: string | null;
  deepSleepDurationMinutes: number | null;
  lightSleepDurationMinutes: number | null;
  remDurationMinutes: number | null;
  awakeDurationMinutes: number | null;
  restlessMoments: number | null;
  restingHeartRate: number | null;
  averageOvernightHeartRate: number | null;
  overnightHrv: number | null;
  hrvStatus: string | null;
  garminStress: number | null;
  bodyBattery: string | null;
  bodyBatteryHigh: number | null;
  bodyBatteryLow: number | null;
  bodyBatteryOnWaking: number | null;
  respirationRate: number | null;
  lowestRespirationRate: number | null;
  pulseOx: number | null;
  lowestPulseOx: number | null;
  breathingVariations: string | null;
  intensityMinutes: number | null;
  floorsClimbed: number | null;
  calories: number | null;
  totalStepsSource?: GarminStepSource | null;
  stepCandidateCount?: number;
  stepRejectedCount?: number;
  stepRejectedReasons?: string[];
  bedtime: string | null;
  wakeTime: string | null;
  sleepStages: string | null;
  sourceFitFiles: number;
  supportedRecords: number;
  warnings: string[];
  fieldSources?: Partial<
    Record<GarminWellnessJournalField, GarminWellnessMetricSource>
  >;
  lowerPriorityJournalValues?: Partial<
    Record<GarminWellnessJournalField, string>
  >;
}

export interface GarminWellnessScanResult {
  requestedDate: string;
  summaries: GarminWellnessSummary[];
  zipFilesFound: number;
  looseFitFilesFound: number;
  sleepCsvFilesFound: number;
  sleepCsvRecordsRead: number;
  fitFilesDecoded: number;
  fitFilesSkipped: number;
  ignoredEntries: number;
  warnings: string[];
  debugNotes: string[];
}

export interface GarminWellnessImportResult extends GarminWellnessScanResult {
  journalPath: string;
  journalCreated: boolean;
  fieldsPopulated: string[];
  fieldsPreserved: string[];
  journalUpdated: boolean;
}

export interface WellnessValue<T> {
  value: T;
  date: string;
  source: "garmin_wellness_fit";
  confidence: "high" | "medium" | "low";
}
