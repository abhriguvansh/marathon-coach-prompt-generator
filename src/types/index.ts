export type Unknownish = string | number | boolean | null | undefined;
export type RecoveryValue = string | number | null;
export type StepValue = string | number | null;
export type StepSource =
  | "journal_manual"
  | "manual_csv"
  | "garmin_daily_export"
  | "strava_daily_export"
  | "unknown";

export interface WeekRange {
  start: Date;
  end: Date;
}

export interface AthleteConfig {
  athleteName: string;
  timezone?: string;
  race: {
    name: string;
    date: string;
    goalTime: string;
    goalPace: string;
  };
  background: {
    experienceLevel: string;
    runningBackground: string;
    baselineRun?: {
      date?: string;
      distanceMiles?: number;
      durationMinutes?: number;
      notes?: string;
    };
    travelNoRunningBreak?: {
      startDate?: string;
      endDate?: string;
      notes?: string;
    };
  };
  normalLifestyleActivity?: {
    averageDailySteps?: number;
    notes?: string;
  };
  recurringCrossTraining?: Array<{
    activityType: string;
    frequency: string;
    notes?: string;
  }>;
  unitPreferences?: {
    distance?: string;
    pace?: string;
    duration?: string;
  };
}

export interface DailyNote {
  date: string;
  totalSteps: StepValue;
  stepsDisplay?: string | null;
  stepsApprox?: number | null;
  stepsSource?: StepSource | null;
  legSoreness: RecoveryValue;
  pain: RecoveryValue;
  painLocation: string | null;
  painType: string | null;
  gaitChanged: boolean | string | null;
  fatigue: RecoveryValue;
  energy: RecoveryValue;
  sleepQuality: RecoveryValue;
  sleepDuration?: string | null;
  sleepDurationMinutes?: number | null;
  sleepScore?: number | null;
  sleepQualityDetail?: string | null;
  deepSleepDuration?: string | null;
  lightSleepDuration?: string | null;
  remDuration?: string | null;
  awakeDuration?: string | null;
  restlessMoments?: number | null;
  restingHeartRate?: number | null;
  averageOvernightHeartRate?: number | null;
  overnightHrv?: number | null;
  hrvStatus?: string | null;
  stress: RecoveryValue;
  garminStress?: number | null;
  bodyBattery?: string | null;
  averageRespiration?: number | null;
  lowestRespiration?: number | null;
  averageSpo2?: number | null;
  lowestSpo2?: number | null;
  breathingVariations?: string | null;
  motivation: RecoveryValue;
  notes: string | null;
}

export interface ActivityNote {
  date: string;
  activityType: string;
  durationMinutes: number | null;
  intensity: string | null;
  details: string | null;
  sorenessBefore: number | null;
  sorenessAfter: number | null;
  nextMorningSoreness: number | null;
  painNotes: string | null;
  gear: string | null;
  fuelingHydrationNotes: string | null;
}

export interface ManualActivity {
  date: string;
  startTime?: string | null;
  source: string;
  activityType: string;
  distanceMiles: number | null;
  durationMinutes: number | null;
  paceMinPerMile: string | null;
  elevationFt: number | null;
  elevationGainFt?: number | null;
  elevationLossFt?: number | null;
  netElevationChangeFt?: number | null;
  elevationSource?: "session" | "lap" | "record-derived" | "unknown" | null;
  elevationDataQuality?: string | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence?: number | null;
  maxCadence?: number | null;
  avgPowerWatts?: number | null;
  maxPowerWatts?: number | null;
  avgWattsPerKg?: number | null;
  maxWattsPerKg?: number | null;
  avgGroundContactTimeMs?: number | null;
  avgStrideLengthMeters?: number | null;
  avgVerticalOscillationCm?: number | null;
  avgVerticalRatioPct?: number | null;
  calories?: number | null;
  elapsedTimeSeconds?: number | null;
  timerTimeSeconds?: number | null;
  movingTimeSeconds?: number | null;
  stoppedTimeSeconds?: number | null;
  gapPaceMinPerMile?: string | null;
  avgMovingPaceMinPerMile?: string | null;
  avgSpeed?: number | null;
  maxSpeed?: number | null;
  bestPaceMinPerMile?: string | null;
  trainingEffect?: number | null;
  anaerobicTrainingEffect?: number | null;
  temperatureC?: number | null;
  temperatureF?: number | null;
  device?: string | null;
  laps?: ActivityLap[];
  runWalkStructure?: RunWalkStructure | null;
  dataQualityNotes?: string[];
  steps: number | null;
  notes: string | null;
}

export interface RunWalkStructure {
  type?:
    | "easy"
    | "recovery"
    | "long"
    | "run_walk"
    | "strides"
    | "hill_strides"
    | "tempo"
    | "marathon_effort"
    | "progression"
    | "mixed"
    | "unknown";
  warmupMinutes?: number;
  warmupType?: string;
  runMinutes?: number;
  walkMinutes?: number;
  cooldownMinutes?: number;
  cooldownType?: string;
  strides?: {
    count?: number;
    seconds?: number;
    hill?: boolean;
  };
  detectedLabels?: string[];
  source?: "activity_description" | "activity_title" | "journal" | "unknown";
}

export interface ActivityLap {
  lapNumber: number;
  label?: string | null;
  kind?: "fit_lap" | "derived_mile_split";
  distanceMiles: number | null;
  durationSeconds: number | null;
  paceMinPerMile: string | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationGainFt: number | null;
  elevationLossFt?: number | null;
  avgCadence: number | null;
  maxCadence?: number | null;
  movingTimeSeconds?: number | null;
  movingPaceMinPerMile?: string | null;
  gapPaceMinPerMile?: string | null;
  avgPowerWatts?: number | null;
  maxPowerWatts?: number | null;
  avgWattsPerKg?: number | null;
  maxWattsPerKg?: number | null;
  avgGroundContactTimeMs?: number | null;
  avgStrideLengthMeters?: number | null;
  avgVerticalOscillationCm?: number | null;
  avgVerticalRatioPct?: number | null;
  calories?: number | null;
  temperatureF?: number | null;
  bestPaceMinPerMile?: string | null;
}

export interface JournalEntry {
  date: string;
  hydration: string | null;
  fueling: string | null;
  bodyWeight: string | null;
  shoes: string | null;
  equipment: string | null;
  gearOtherNotes: string | null;
  workoutStructure?: string | null;
  runWalkFormat?: string | null;
  coachNotes: string | null;
  questionsForCoach: string | null;
}

export type ExportSource =
  | "garmin_export"
  | "strava_export"
  | "garmin_fit_export"
  | "strava_fit_export";

export interface ExportParseWarning {
  source: ExportSource | "unknown";
  extension?: string;
  message: string;
}

export interface ExportFileInfo {
  relativePath: string;
  source: ExportSource;
  extension: string;
  supported: boolean;
}

export interface ExportScanResult {
  files: ExportFileInfo[];
  warnings: ExportParseWarning[];
}

export interface ExportParseResult {
  activities: ManualActivity[];
  scan: ExportScanResult;
  warnings: ExportParseWarning[];
}

export interface DuplicateActivityWarning {
  level: "high_confidence" | "uncertain";
  message: string;
  excludedFromTotals: boolean;
}

export interface SafetyFlag {
  level: "info" | "concern";
  message: string;
}

export interface MissingDataFlag {
  field: string;
  message: string;
}

export interface CheckInCompleteness {
  status: "complete" | "needs_subjective_details";
  activityContext: "run" | "non_run_activity" | "no_activity";
  missingHighValueFields: string[];
  optionalReminders: string[];
  manualOnlyActivityReminder: string | null;
}

export interface DayLoadClassification {
  dayType: string;
  loadClassification: string;
  coachingInterpretation: string;
}

export interface RecoveryTrendFlags {
  bullets: string[];
  hasCaution: boolean;
}

export interface DailySummary {
  date: string;
  evidenceDate: string;
  athleteConfig: AthleteConfig;
  dailyNote: DailyNote | null;
  activityNotes: ActivityNote[];
  manualActivities: ManualActivity[];
  planNotes: string | null;
  journalEntry: JournalEntry | null;
  exportWarnings: ExportParseWarning[];
  duplicateWarnings: DuplicateActivityWarning[];
  daysUntilRace: number;
  runningMileage: number;
  walkingMileage: number;
  runs: ManualActivity[];
  walks: ManualActivity[];
  rockClimbing: ManualActivity[];
  tennis: ManualActivity[];
  weights: ManualActivity[];
  mobility: ManualActivity[];
  restOrOther: ManualActivity[];
  safetyFlags: SafetyFlag[];
  missingDataFlags: MissingDataFlag[];
  dayLoadClassification: DayLoadClassification;
  recentCoachingContext: string[];
  recoveryTrendFlags: RecoveryTrendFlags;
  checkInCompleteness: CheckInCompleteness;
}

export interface WeeklyActivityTotals {
  runningMileage: number;
  walkingMileage: number;
  totalActiveMileage: number;
  runningDurationMinutes: number;
  walkingDurationMinutes: number;
  runCount: number;
  walkCount: number;
  rockClimbingCount: number;
  tennisCount: number;
  weightsCount: number;
  mobilityRestOtherCount: number;
  totalSteps: number | null;
  averageDailySteps: number | null;
  stepDaysWithData: number;
  highStepDays: number;
  longestRun: ManualActivity | null;
  longestWalk: ManualActivity | null;
  runElevationGainFt: number | null;
  runElevationLossFt: number | null;
  walkElevationGainFt: number | null;
  walkElevationLossFt: number | null;
  totalElevationGainFt: number | null;
  totalElevationLossFt: number | null;
  averageRunPaceSecondsPerMile: number | null;
  averageWalkPaceSecondsPerMile: number | null;
  averageRunHr: number | null;
  averageWalkHr: number | null;
  totalCalories: number | null;
  higherLoadActivities: ManualActivity[];
  wellnessCoverageDays: number;
  averageSleepDurationMinutes: number | null;
  averageSleepScore: number | null;
  averageGarminStress: number | null;
  averageRestingHeartRate: number | null;
  hrvStatusCoverageDays: number;
  bodyBatteryCoverageDays: number;
}

export interface WeeklyRecoveryTrend {
  sorenessAverage: number | null;
  sorenessHighest: number | null;
  painReports: DailyNote[];
  fatigueAverage: number | null;
  energyAverage: number | null;
  sleepAverage: number | null;
  stressAverage: number | null;
}

export type WeeklySafetyFlag = SafetyFlag;
export type WeeklyMissingDataFlag = MissingDataFlag;

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  evidenceStart: string;
  evidenceEnd: string;
  athleteConfig: AthleteConfig;
  daysUntilRaceAtWeekEnd: number;
  dailyNotes: DailyNote[];
  activityNotes: ActivityNote[];
  manualActivities: ManualActivity[];
  planNotes: string | null;
  journalEntries: JournalEntry[];
  exportWarnings: ExportParseWarning[];
  duplicateWarnings: DuplicateActivityWarning[];
  totals: WeeklyActivityTotals;
  recovery: WeeklyRecoveryTrend;
  activityListByDay: Array<{
    date: string;
    activities: ManualActivity[];
    hasJournal: boolean;
    hasRecoveryNotes: boolean;
    confirmedRest: boolean;
    dayLoadClassification: DayLoadClassification;
  }>;
  travelBreakNote: string | null;
  recoveryTrendFlags: RecoveryTrendFlags;
  safetyFlags: WeeklySafetyFlag[];
  missingDataFlags: WeeklyMissingDataFlag[];
}
