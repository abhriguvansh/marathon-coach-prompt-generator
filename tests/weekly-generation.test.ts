import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { nextMonday, runWeeklyCoachWorkflow } from "../src/cli/coach-weekly";
import {
  generateWeeklySummary,
  parseGenerateWeeklyArgs,
} from "../src/cli/generate-weekly";
import { createDailySummary } from "../src/generator/daily-summary";
import { createWeeklySummary } from "../src/generator/weekly-summary";
import { renderWeeklySummary } from "../src/generator/weekly-markdown";
import { parseJournal } from "../src/parsers/journal";
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

    assert.equal(summary.weekStart, "2026-06-29");
    assert.equal(summary.weekEnd, "2026-07-05");
    assert.equal(summary.evidenceStart, "2026-06-22");
    assert.equal(summary.evidenceEnd, "2026-06-28");
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

  it("uses one authoritative step value per evidence date with journal priority", () => {
    const summary = createWeeklySummary({
      weekStart: "2026-07-06",
      athleteConfig: fakeConfigWithoutTravel(),
      dailyNotes: [
        {
          ...fakeDailyNote(
            "2026-07-05",
            7962,
            1,
            0,
            "none",
            "none",
            false,
            2,
            8,
            7,
            3,
          ),
          stepsSource: "manual_csv",
        },
        {
          ...fakeDailyNote(
            "2026-07-05",
            2500,
            1,
            0,
            "none",
            "none",
            false,
            2,
            8,
            7,
            3,
          ),
          stepsSource: "journal_manual",
        },
      ],
      activityNotes: [],
      manualActivities: [],
      planNotes: null,
    });

    assert.equal(summary.totals.totalSteps, 2500);
    assert.equal(summary.totals.averageDailySteps, 2500);
    assert.equal(summary.totals.stepDaysWithData, 1);
    assert.equal(summary.totals.highStepDays, 0);
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
      false,
    );
  });

  it("renders weekly Markdown", () => {
    const markdown = renderWeeklySummary(buildWeeklySummary());

    assert.match(markdown, /# Weekly Marathon Coach Check-In/);
    assert.match(markdown, /Week start: 2026-06-29/);
    assert.match(markdown, /Evidence window: 2026-06-22 to 2026-06-28/);
    assert.match(markdown, /Running mileage: 7 mi/);
    assert.match(markdown, /Walking mileage: 3 mi/);
    assert.match(markdown, /## Day Type Summary/);
    assert.match(markdown, /Running sessions: 2/);
    assert.match(markdown, /Running days: 2/);
    assert.match(markdown, /Run-only days: 1/);
    assert.match(markdown, /Run-only high-step days: 1/);
    assert.match(markdown, /Walk-only days: 1/);
    assert.match(markdown, /Mixed non-running load days: 1/);
    assert.match(markdown, /Mobility\/recovery days: 1/);
    assert.match(markdown, /Rock climbing sessions: 1/);
    assert.match(markdown, /Confirmed rest\/no-run days: 1/);
    assert.match(markdown, /Days with no activity data found: 0/);
    assert.match(markdown, /route details omitted/);
    assert.match(markdown, /Gait-change flags: 2026-06-26/);
    assert.match(markdown, /## Weekly Recovery Trend Flags/);
    assert.match(markdown, /Fake travel week/);
    assert.doesNotMatch(markdown, /## Athlete Background/);
    assert.doesNotMatch(markdown, /lat=|lon=|trkpt|position_lat|position_long/);
    assert.match(markdown, /how should I structure the upcoming week/i);
  });

  it("formats weekly activity distances and durations without raw decimals", () => {
    const summary = createWeeklySummary({
      weekStart: "2026-06-29",
      athleteConfig: fakeConfig,
      dailyNotes: [],
      activityNotes: [],
      manualActivities: [
        fakeActivity(
          "2026-06-27",
          "run",
          3.2477580927384078,
          42.86666666666667,
          null,
          null,
        ),
        fakeActivity("2026-06-26", "walk", 3.868918018770381, 61.2, null, null),
      ],
      planNotes: null,
    });
    const markdown = renderWeeklySummary(summary);

    assert.match(markdown, /Longest run: 2026-06-27, run, 3\.25 mi, 42:52/);
    assert.match(markdown, /walk, 3\.87 mi, 1:01:12/);
    assert.doesNotMatch(markdown, /3\.2477580927384078|3\.868918018770381/);
    assert.doesNotMatch(markdown, /42\.86666666666667 min|61\.2 min/);
  });

  it("includes compact run/walk format in weekly activity details", () => {
    const summary = createWeeklySummary({
      weekStart: "2026-06-29",
      athleteConfig: fakeConfig,
      dailyNotes: [],
      activityNotes: [],
      manualActivities: [
        {
          ...fakeActivity(
            "2026-06-27",
            "run",
            3.25,
            42.86666666666667,
            null,
            null,
          ),
          source: "strava_fit_export",
          notes: "2.5 min walk warmup + 4/1 run walk + 5 min walk cooldown",
        },
      ],
      planNotes: null,
    });
    const markdown = renderWeeklySummary(summary);

    assert.match(
      markdown,
      /Longest run: 2026-06-27, run\/walk, 3\.25 mi, 42:52, 4:1/,
    );
    assert.match(
      markdown,
      /2026-06-27: run\/walk, 3\.25 mi, 42:52, 4:1, source strava_fit_export, route details omitted/,
    );
    assert.doesNotMatch(markdown, /2\.5 min walk warmup/);
  });

  it("distinguishes missing activity data from confirmed rest and recovery-only days", () => {
    const summary = createWeeklySummary({
      weekStart: "2026-06-29",
      athleteConfig: fakeConfig,
      dailyNotes: [
        {
          ...fakeDailyNote(
            "2026-06-23",
            8000,
            1,
            0,
            "na",
            "na",
            false,
            2,
            8,
            7,
            3,
          ),
          notes: "Fake recovery-only notes.",
        },
        {
          ...fakeDailyNote(
            "2026-06-24",
            7000,
            1,
            0,
            "na",
            "na",
            false,
            2,
            8,
            7,
            3,
          ),
          notes: "Rest day, no running.",
        },
      ],
      activityNotes: [],
      manualActivities: [fakeActivity("2026-06-22", "run", 3, 30, null, null)],
      planNotes: null,
    });
    const markdown = renderWeeklySummary(summary);

    assert.match(markdown, /Confirmed rest\/no-run days: 1/);
    assert.match(markdown, /Days with no activity data found: 4/);
    assert.match(
      markdown,
      /2026-06-23: moderate-step no-run day; no imported or manual activities/,
    );
    assert.match(markdown, /2026-06-24: confirmed no-run\/rest day/);
    assert.match(markdown, /2026-06-25: no activity data found/);
    assert.doesNotMatch(markdown, /Rest days: 5/);
  });

  it("keeps historical coach notes out of upcoming constraints", () => {
    const summary = createWeeklySummary({
      weekStart: "2026-07-06",
      athleteConfig: fakeConfigWithoutTravel(),
      dailyNotes: [],
      activityNotes: [],
      manualActivities: [],
      planNotes: null,
      journalEntries: [
        {
          date: "2026-07-01",
          hydration: null,
          fueling: null,
          bodyWeight: null,
          shoes: null,
          equipment: null,
          gearOtherNotes: null,
          workoutStructure: null,
          runWalkFormat: null,
          coachNotes: "Rest day today after travel.",
          questionsForCoach: null,
        },
      ],
    });
    const markdown = renderWeeklySummary(summary);

    assert.match(
      markdown,
      /No upcoming constraints found in journals, plan notes, or config/,
    );
    assert.doesNotMatch(markdown, /Rest day today after travel/);
  });

  it("includes future-facing journal constraints", () => {
    const summary = createWeeklySummary({
      weekStart: "2026-07-06",
      athleteConfig: fakeConfig,
      dailyNotes: [],
      activityNotes: [],
      manualActivities: [],
      planNotes: null,
      journalEntries: [
        {
          date: "2026-07-05",
          hydration: null,
          fueling: null,
          bodyWeight: null,
          shoes: null,
          equipment: null,
          gearOtherNotes: null,
          workoutStructure: null,
          runWalkFormat: null,
          coachNotes: "Tomorrow is an amusement park day with limited time.",
          questionsForCoach: null,
        },
      ],
    });
    const markdown = renderWeeklySummary(summary);

    assert.match(
      markdown,
      /Upcoming journal constraint note: Tomorrow is an amusement park day with limited time\./,
    );
  });

  it("applies manual full-session overrides without losing device metrics", () => {
    const activities = [
      {
        ...fakeActivity("2026-07-03", "run", 2.81, 40.15, 80, 142),
        source: "garmin_fit_export",
        avgCadence: 158,
      },
      {
        ...fakeActivity("2026-07-03", "run", 3.1, 45, null, null),
        source: "journal_full_session_override",
        distanceSource: "manual_full_session" as const,
        durationSource: "manual_full_session" as const,
        notes: "Recording note: watch recording missed warmup.",
      },
    ];
    const weekly = createWeeklySummary({
      weekStart: "2026-07-06",
      athleteConfig: fakeConfig,
      dailyNotes: [],
      activityNotes: [],
      manualActivities: activities,
      planNotes: null,
    });
    const daily = createDailySummary({
      date: "2026-07-04",
      athleteConfig: fakeConfig,
      dailyNotes: [],
      activityNotes: [],
      manualActivities: activities,
      planNotes: null,
    });
    const markdown = renderWeeklySummary(weekly);

    assert.equal(weekly.totals.runningMileage, 3.1);
    assert.equal(weekly.totals.runCount, 1);
    assert.equal(weekly.totals.longestRun?.distanceMiles, 3.1);
    assert.equal(weekly.totals.averageRunHr, 142);
    assert.equal(daily.runningMileage, 3.1);
    assert.equal(daily.runs[0].avgCadence, 158);
    assert.match(markdown, /3\.1 mi full session/);
    assert.match(markdown, /45:00 full session/);
    assert.match(markdown, /Garmin-recorded metrics from garmin_fit_export/);
  });

  it("separates sessions, activity days, and standalone day types", () => {
    const summary = createWeeklySummary({
      weekStart: "2026-07-06",
      athleteConfig: fakeConfigWithoutTravel(),
      dailyNotes: [],
      activityNotes: [],
      manualActivities: [
        fakeActivity("2026-06-29", "run", 3, 32, null, null),
        fakeActivity("2026-06-30", "run", 2, 24, null, null),
        fakeActivity("2026-06-30", "rock_climbing", null, 60, null, null),
        fakeActivity("2026-07-01", "run", 2.5, 30, null, null),
        fakeActivity("2026-07-01", "rock_climbing", null, 45, null, null),
        fakeActivity("2026-07-02", "tennis", null, 50, null, null),
      ],
      planNotes: null,
    });
    const markdown = renderWeeklySummary(summary);

    assert.match(markdown, /Running sessions: 3/);
    assert.match(markdown, /Running days: 3/);
    assert.match(markdown, /Rock climbing sessions: 2/);
    assert.match(markdown, /Rock climbing days: 2/);
    assert.match(markdown, /Run-only days: 1/);
    assert.match(markdown, /Climbing-only days: 0/);
    assert.match(markdown, /Tennis-only days: 1/);
    assert.match(markdown, /Mixed-load days: 2/);
    assert.match(markdown, /Mixed-load days containing running: 2/);
    assert.match(markdown, /Mixed-load days containing climbing: 2/);
    assert.match(markdown, /Days with no activity data found: 3/);
    assert.doesNotMatch(markdown, /^- Run days:/m);
    assert.doesNotMatch(markdown, /^- Climbing days:/m);
  });

  it("parses explicit journal full-session fields only", () => {
    const parsed = parseJournal(
      [
        "# Daily Journal",
        "",
        "Date: 2026-07-03",
        "",
        "## Manual Activities",
        "",
        "### Run",
        "",
        "Duration: 40:09",
        "",
        "Full Session Distance: 3.1 mi",
        "",
        "Full Session Duration: 45:00",
        "",
        "Recording Note: watch recording missed warmup",
      ].join("\n"),
    );

    assert.equal(
      parsed.manualActivities[0].source,
      "journal_full_session_override",
    );
    assert.equal(parsed.manualActivities[0].distanceMiles, 3.1);
    assert.equal(parsed.manualActivities[0].durationMinutes, 45);
    assert.equal(
      parsed.manualActivities[0].distanceSource,
      "manual_full_session",
    );
    assert.equal(
      parsed.manualActivities[0].durationSource,
      "manual_full_session",
    );
  });

  it("does not create a full-session override when explicit fields are blank", () => {
    const parsed = parseJournal(
      [
        "# Daily Journal",
        "",
        "Date: 2026-07-03",
        "",
        "## Manual Activities",
        "",
        "### Run",
        "",
        "Duration: 40:09",
        "",
        "Full Session Distance:",
        "",
        "Full Session Duration:",
        "",
        "Recording Note: Garmin started late but no deterministic correction.",
      ].join("\n"),
    );

    assert.equal(parsed.manualActivities[0].source, "journal");
    assert.equal(parsed.manualActivities[0].distanceMiles, null);
    assert.equal(parsed.manualActivities[0].distanceSource, null);
    assert.equal(parsed.manualActivities[0].durationMinutes, 40.15);
    assert.equal(parsed.manualActivities[0].durationSource, null);
  });

  it("cleans pain, gait, and natural-language recovery wording", () => {
    const summary = createWeeklySummary({
      weekStart: "2026-06-29",
      athleteConfig: fakeConfig,
      dailyNotes: [
        {
          ...fakeDailyNote(
            "2026-06-22",
            8000,
            1,
            0,
            "na",
            "na",
            false,
            2,
            8,
            7,
            3,
          ),
          fatigue: "no fatigue problems",
          energy: "average",
          sleepQuality: "slept okay",
          stress: "average",
        },
      ],
      activityNotes: [],
      manualActivities: [],
      planNotes: null,
    });
    const markdown = renderWeeklySummary(summary);

    assert.match(markdown, /Pain reports: none reported\./);
    assert.doesNotMatch(markdown, /na na/);
    assert.match(markdown, /Gait-change flags: none reported/);
    assert.match(markdown, /Fatigue notes: no fatigue problems/);
    assert.match(markdown, /Energy notes: average/);
    assert.match(markdown, /Sleep notes: slept okay/);
    assert.match(markdown, /Stress notes: average/);
  });

  it("renders nonzero pain with clean detail wording", () => {
    const summary = createWeeklySummary({
      weekStart: "2026-06-29",
      athleteConfig: fakeConfig,
      dailyNotes: [
        fakeDailyNote(
          "2026-06-22",
          8000,
          1,
          2,
          "left shin",
          "dull ache",
          false,
          2,
          8,
          7,
          3,
        ),
        fakeDailyNote("2026-06-23", 8000, 1, 2, "", "", false, 2, 8, 7, 3),
      ],
      activityNotes: [],
      manualActivities: [],
      planNotes: null,
    });
    const markdown = renderWeeklySummary(summary);

    assert.match(markdown, /2026-06-22: left shin, dull ache, 2\/10\./);
    assert.match(
      markdown,
      /2026-06-23: pain 2\/10; location\/type not provided\./,
    );
  });

  it("parses preview CLI arguments", () => {
    assert.deepEqual(
      parseGenerateWeeklyArgs(["--week-start", "2026-06-22", "--preview"]),
      {
        weekStart: "2026-06-22",
        preview: true,
        debug: false,
      },
    );
  });

  it("calculates next Monday for coach:weekly across month and year boundaries", () => {
    assert.equal(nextMonday(new Date("2026-06-28T12:00:00")), "2026-06-29");
    assert.equal(nextMonday(new Date("2026-12-31T12:00:00")), "2027-01-04");
  });

  it("writes weekly output to output/weekly-checkin.md", () => {
    const dir = makeWeeklyProject();
    const result = generateWeeklySummary(dir, {
      weekStart: "2026-06-29",
      preview: false,
      debug: false,
    });

    assert.equal(result.weekStart, "2026-06-29");
    assert.equal(result.evidenceStart, "2026-06-22");
    assert.equal(result.evidenceEnd, "2026-06-28");
    assert.match(result.outputPath, /output[\\/]+weekly-checkin\.md$/);
    assert.match(
      readFileSync(join(dir, "output/weekly-checkin.md"), "utf8"),
      /# Weekly Marathon Coach Check-In/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("weekly CLI debug reports the canonical journal step source", () => {
    const dir = makeWeeklyProject();
    writeFile(
      join(dir, "input/journal/2026-06-26.md"),
      [
        "# Daily Journal",
        "",
        "Date: 2026-06-26",
        "",
        "## Recovery",
        "",
        "Total Steps: 2,500",
      ].join("\n"),
    );

    const result = generateWeeklySummary(dir, {
      weekStart: "2026-06-29",
      preview: false,
      debug: true,
    });

    assert.equal(
      result.debugNotes.some((note) => note.includes("manual_journal")),
      true,
    );
    assert.equal(
      result.debugNotes.some((note) => note.includes("2,500")),
      true,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("coach:weekly defaults to next Monday and prints concise dates", () => {
    const dir = makeWeeklyProject();
    const logs: string[] = [];
    const result = runWeeklyCoachWorkflow({
      cwd: dir,
      args: { weekStart: null, debug: false },
      now: new Date("2026-06-28T12:00:00"),
      log: (message) => logs.push(message),
    });

    assert.equal(result.weekStart, "2026-06-29");
    assert.match(logs.join("\n"), /Weekly coach workflow/);
    assert.match(logs.join("\n"), /Planning week: 2026-06-29 to 2026-07-05/);
    assert.match(logs.join("\n"), /Evidence window: 2026-06-22 to 2026-06-28/);
    assert.match(logs.join("\n"), /Output: output\/weekly-checkin\.md/);
    rmSync(dir, { recursive: true, force: true });
  });
});

function buildWeeklySummary(overrides: { planNotes?: string | null } = {}) {
  const planNotes: string | null =
    "planNotes" in overrides
      ? (overrides.planNotes ?? null)
      : "Fake weekly plan note.";

  return createWeeklySummary({
    weekStart: "2026-06-29",
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

function fakeConfigWithoutTravel(): AthleteConfig {
  return {
    ...fakeConfig,
    background: {
      ...fakeConfig.background,
      travelNoRunningBreak: undefined,
    },
  };
}

function makeWeeklyProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "marathon-weekly-test-"));

  writeJson(join(dir, "private/athlete.config.local.json"), fakeConfig);
  writeFile(
    join(dir, "input/manual/daily-notes.csv"),
    [
      "date,total_steps,leg_soreness_0_10,pain_0_10,pain_location,pain_type,gait_changed,fatigue_0_10,energy_0_10,sleep_quality_0_10,stress_0_10,motivation_0_10,notes",
      "2026-06-22,10000,1,0,none,none,no,2,8,8,2,8,Fake note",
      "2026-06-26,13000,4,4,left calf,sharp,yes,5,7,7,5,8,Fake worsening note",
    ].join("\n"),
  );
  writeFile(
    join(dir, "input/manual/manual-activities.csv"),
    [
      "date,source,activity_type,distance_miles,duration_minutes,pace_min_per_mile,elevation_ft,avg_hr,max_hr,steps,notes",
      "2026-06-22,manual,run,3,31,10:20,100,142,157,,Fake run",
      "2026-06-26,manual,run,4,41,10:15,250,148,163,,Fake longer run",
      "2026-06-27,manual,walk,2,35,17:30,,,,,Fake walk",
    ].join("\n"),
  );
  mkdirSync(join(dir, "input/garmin"), { recursive: true });
  mkdirSync(join(dir, "input/strava"), { recursive: true });

  return dir;
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

function writeJson(path: string, value: unknown): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
