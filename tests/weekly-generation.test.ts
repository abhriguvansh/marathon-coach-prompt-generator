import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGenerateWeeklyArgs } from "../src/cli/generate-weekly";
import { createWeeklySummary } from "../src/generator/weekly-summary";
import { renderWeeklySummary } from "../src/generator/weekly-markdown";
import type { AthleteConfig, DailyNote, ManualActivity } from "../src/types";

const fakeConfig: AthleteConfig = {
  athleteName: "Sample Runner",
  race: {
    name: "Example City Marathon",
    date: "2026-11-29",
    goalTime: "4:30 stretch goal",
    goalPace: "10:18 min/mi",
  },
  background: {
    experienceLevel: "beginner",
    runningBackground: "Fake weekly run-walk background.",
    baselineRun: {
      date: "2026-06-01",
      distanceMiles: 3.1,
      durationMinutes: 36,
      notes: "Fake baseline.",
    },
    travelNoRunningBreak: {
      startDate: "2026-07-06",
      endDate: "2026-07-10",
      notes: "Fake travel week.",
    },
  },
  normalLifestyleActivity: {
    averageDailySteps: 8500,
    notes: "Fake baseline steps.",
  },
  recurringCrossTraining: [
    {
      activityType: "mobility",
      frequency: "twice weekly",
      notes: "Fake mobility.",
    },
  ],
};

describe("weekly generation", () => {
  it("calculates weekly date range and aggregate totals", () => {
    const summary = buildWeeklySummary();

    assert.equal(summary.weekStart, "2026-06-22");
    assert.equal(summary.weekEnd, "2026-06-28");
    assert.equal(summary.totals.runCount, 2);
    assert.equal(summary.totals.walkCount, 2);
    assert.equal(summary.totals.runningMileage, 7);
    assert.equal(summary.totals.walkingMileage, 3);
    assert.equal(summary.totals.totalActiveMileage, 10);
    assert.equal(summary.totals.runningDurationMinutes, 72);
    assert.equal(summary.totals.walkingDurationMinutes, 55);
  });

  it("calculates longest activities, steps, pace, elevation, and HR", () => {
    const summary = buildWeeklySummary();

    assert.equal(summary.totals.longestRun?.distanceMiles, 4);
    assert.equal(summary.totals.longestWalk?.distanceMiles, 2);
    assert.equal(summary.totals.totalSteps, 44000);
    assert.equal(summary.totals.averageDailySteps, 11000);
    assert.equal(summary.totals.rockClimbingCount, 1);
    assert.equal(summary.totals.tennisCount, 1);
    assert.equal(summary.totals.weightsCount, 1);
    assert.equal(summary.totals.mobilityRestOtherCount, 2);
    assert.equal(summary.totals.runElevationGainFt, 350);
    assert.equal(
      Math.round(summary.totals.averageRunPaceSecondsPerMile ?? 0),
      617,
    );
    assert.equal(Math.round(summary.totals.averageRunHr ?? 0), 145);
  });

  it("summarizes soreness, fatigue, energy, pain, and safety flags", () => {
    const summary = buildWeeklySummary();

    assert.equal(summary.recovery.sorenessAverage, 2.5);
    assert.equal(summary.recovery.sorenessHighest, 4);
    assert.equal(summary.recovery.painReports.length, 2);
    assert.equal(summary.recovery.fatigueAverage, 3.5);
    assert.equal(summary.recovery.energyAverage, 7);
    assert.equal(summary.recovery.sleepAverage, 7.5);
    assert.equal(summary.recovery.stressAverage, 3.5);
    assert.equal(summary.safetyFlags.length, 6);
  });

  it("notes approaching travel breaks and missing data", () => {
    const summary = buildWeeklySummary({ planNotes: null });

    assert.match(summary.travelBreakNote ?? "", /is approaching/);
    assert.equal(
      summary.missingDataFlags.some((flag) => flag.field === "plan-notes.md"),
      true,
    );
  });

  it("renders weekly Markdown", () => {
    const markdown = renderWeeklySummary(buildWeeklySummary());

    assert.match(markdown, /# Weekly Marathon Training Summary/);
    assert.match(markdown, /Running mileage: 7 mi/);
    assert.match(markdown, /Walking mileage: 3 mi/);
    assert.match(markdown, /Total active mileage: 10 mi/);
    assert.match(markdown, /Average run pace: 10:17 min\/mi/);
    assert.match(markdown, /Fake travel week/);
    assert.match(markdown, /progress, hold steady, or back off/);
  });

  it("parses preview CLI arguments", () => {
    assert.deepEqual(
      parseGenerateWeeklyArgs(["--week-start", "2026-06-22", "--preview"]),
      {
        weekStart: "2026-06-22",
        preview: true,
      },
    );
  });
});

function buildWeeklySummary(overrides: { planNotes?: string | null } = {}) {
  const planNotes: string | null =
    "planNotes" in overrides
      ? (overrides.planNotes ?? null)
      : "Fake weekly plan note.";

  return createWeeklySummary({
    weekStart: "2026-06-22",
    athleteConfig: fakeConfig,
    dailyNotes: fakeDailyNotes(),
    activityNotes: [
      {
        date: "2026-06-26",
        activityType: "run",
        durationMinutes: 41,
        intensity: "easy",
        details: "Fake longer run",
        sorenessBefore: 2,
        sorenessAfter: 4,
        nextMorningSoreness: 4,
        painNotes: "pain felt worse late",
        gear: "Demo shoes",
        fuelingHydrationNotes: "water",
      },
    ],
    manualActivities: fakeActivities(),
    planNotes,
  });
}

function fakeDailyNotes(): DailyNote[] {
  return [
    fakeDailyNote("2026-06-22", 10000, 1, 0, "none", "none", false, 2, 8, 8, 2),
    fakeDailyNote(
      "2026-06-23",
      12000,
      2,
      1,
      "right knee",
      "dull",
      false,
      3,
      7,
      7,
      3,
    ),
    fakeDailyNote("2026-06-24", 9000, 3, 0, "none", "none", false, 4, 6, 8, 4),
    fakeDailyNote(
      "2026-06-26",
      13000,
      4,
      4,
      "left calf",
      "sharp",
      true,
      5,
      7,
      7,
      5,
    ),
  ];
}

function fakeDailyNote(
  date: string,
  totalSteps: number,
  legSoreness: number,
  pain: number,
  painLocation: string,
  painType: string,
  gaitChanged: boolean,
  fatigue: number,
  energy: number,
  sleepQuality: number,
  stress: number,
): DailyNote {
  return {
    date,
    totalSteps,
    legSoreness,
    pain,
    painLocation,
    painType,
    gaitChanged,
    fatigue,
    energy,
    sleepQuality,
    stress,
    motivation: 8,
    notes:
      pain >= 4 ? "Fake note says pain is worsening." : "Fake ordinary note.",
  };
}

function fakeActivities(): ManualActivity[] {
  return [
    fakeActivity("2026-06-22", "run", 3, 31, 100, 142),
    fakeActivity("2026-06-23", "walk", 1, 20, null, null),
    fakeActivity("2026-06-24", "rock_climbing", null, 60, null, null),
    fakeActivity("2026-06-25", "tennis", null, 45, null, null),
    fakeActivity("2026-06-26", "run", 4, 41, 250, 148),
    fakeActivity("2026-06-27", "walk", 2, 35, null, null),
    fakeActivity("2026-06-27", "weights", null, 30, null, null),
    fakeActivity("2026-06-28", "mobility", null, 20, null, null),
    fakeActivity("2026-06-28", "rest", null, null, null, null),
    fakeActivity("2026-06-30", "run", 10, 100, 1000, 150),
  ];
}

function fakeActivity(
  date: string,
  activityType: string,
  distanceMiles: number | null,
  durationMinutes: number | null,
  elevationFt: number | null,
  avgHr: number | null,
): ManualActivity {
  return {
    date,
    source: "manual",
    activityType,
    distanceMiles,
    durationMinutes,
    paceMinPerMile: null,
    elevationFt,
    avgHr,
    maxHr: avgHr === null ? null : avgHr + 15,
    steps: null,
    notes: `Fake ${activityType}`,
  };
}
