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
  bedtime: string | null;
  wakeTime: string | null;
  sleepStages: string | null;
  sourceFitFiles: number;
  supportedRecords: number;
  warnings: string[];
}

export interface GarminWellnessScanResult {
  requestedDate: string;
  summaries: GarminWellnessSummary[];
  zipFilesFound: number;
  looseFitFilesFound: number;
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
