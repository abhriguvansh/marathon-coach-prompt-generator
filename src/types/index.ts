export type Unknownish = string | number | boolean | null | undefined;

export interface WeekRange {
  start: Date;
  end: Date;
}

export interface AthleteConfig {
  athleteName: string;
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
  totalSteps: number | null;
  legSoreness: number | null;
  pain: number | null;
  painLocation: string | null;
  painType: string | null;
  gaitChanged: boolean | null;
  fatigue: number | null;
  energy: number | null;
  sleepQuality: number | null;
  stress: number | null;
  motivation: number | null;
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
  source: string;
  activityType: string;
  distanceMiles: number | null;
  durationMinutes: number | null;
  paceMinPerMile: string | null;
  elevationFt: number | null;
  avgHr: number | null;
  maxHr: number | null;
  steps: number | null;
  notes: string | null;
}

export interface SafetyFlag {
  level: "info" | "concern";
  message: string;
}

export interface MissingDataFlag {
  field: string;
  message: string;
}

export interface DailySummary {
  date: string;
  evidenceDate: string;
  athleteConfig: AthleteConfig;
  dailyNote: DailyNote | null;
  activityNotes: ActivityNote[];
  manualActivities: ManualActivity[];
  planNotes: string | null;
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
}
