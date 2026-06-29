import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadAthleteConfig } from "../src/config/load";
import { createDailySummary } from "../src/generator/daily-summary";
import { renderDailyCheckIn } from "../src/generator/daily-markdown";
import {
  loadManualInputs,
  parseActivityNotes,
  parseDailyNotes,
  parseManualActivities,
} from "../src/parsers/manual-notes";
import type { AthleteConfig } from "../src/types";
import { parseCsv } from "../src/utils/csv";

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
    runningBackground: "Fake consistent run-walk background.",
    baselineRun: {
      date: "2026-06-01",
      distanceMiles: 3.1,
      durationMinutes: 36,
      notes: "Fake baseline run.",
    },
  },
  normalLifestyleActivity: {
    averageDailySteps: 8500,
    notes: "Fake ordinary walking baseline.",
  },
  recurringCrossTraining: [
    {
      activityType: "weights",
      frequency: "weekly",
      notes: "Fake light strength.",
    },
  ],
};

describe("manual CSV parsing", () => {
  it("parses daily notes with booleans and numbers", () => {
    const notes = parseDailyNotes(
      [
        "date,total_steps,leg_soreness_0_10,pain_0_10,pain_location,pain_type,gait_changed,fatigue_0_10,energy_0_10,sleep_quality_0_10,stress_0_10,motivation_0_10,notes",
        "2026-06-26,12345,3,4,left calf,sharp,yes,5,6,7,3,8,pain felt worse late",
      ].join("\n"),
    );

    assert.equal(notes[0].totalSteps, 12345);
    assert.equal(notes[0].gaitChanged, true);
    assert.equal(notes[0].pain, 4);
  });

  it("parses activity notes", () => {
    const notes = parseActivityNotes(
      [
        "date,activity_type,duration_minutes,intensity,details,soreness_before_0_10,soreness_after_0_10,next_morning_soreness_0_10,pain_notes,gear,fueling_hydration_notes",
        "2026-06-26,run,35,easy,Fake easy run,1,2,2,none,Demo shoes,water",
      ].join("\n"),
    );

    assert.equal(notes[0].activityType, "run");
    assert.equal(notes[0].durationMinutes, 35);
    assert.equal(notes[0].gear, "Demo shoes");
  });

  it("parses manual activities", () => {
    const activities = parseManualActivities(
      [
        "date,source,activity_type,distance_miles,duration_minutes,pace_min_per_mile,elevation_ft,avg_hr,max_hr,steps,notes",
        "2026-06-26,manual,walk,2.5,45,18:00,50,,,5000,Fake walk",
      ].join("\n"),
    );

    assert.equal(activities[0].activityType, "walk");
    assert.equal(activities[0].distanceMiles, 2.5);
    assert.equal(activities[0].avgHr, null);
  });

  it("handles quoted CSV values with commas", () => {
    const records = parseCsv('date,notes\n2026-06-26,"Fake note, with comma"');

    assert.equal(records[0].notes, "Fake note, with comma");
  });
});

describe("config and input loading", () => {
  it("loads local config when present", () => {
    const dir = makeTempProject();
    writeJson(join(dir, "private/athlete.config.local.json"), fakeConfig);

    const loaded = loadAthleteConfig(dir);

    assert.equal(loaded.source, "local");
    assert.equal(loaded.config.athleteName, "Sample Runner");
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws a helpful error when local config is missing", () => {
    const dir = makeTempProject();

    assert.throws(() => loadAthleteConfig(dir), /Missing local athlete config/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports missing input files", () => {
    const dir = makeTempProject();
    const inputs = loadManualInputs({
      dailyNotesPath: join(dir, "input/manual/daily-notes.csv"),
      activityNotesPath: join(dir, "input/manual/activity-notes.csv"),
      manualActivitiesPath: join(dir, "input/manual/manual-activities.csv"),
      planNotesPath: join(dir, "input/manual/plan-notes.md"),
    });

    assert.equal(inputs.missingFiles.length, 4);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("daily summary generation", () => {
  it("separates runs, walks, and cross-training while calculating mileage", () => {
    const summary = buildFakeSummary();

    assert.equal(summary.runs.length, 1);
    assert.equal(summary.walks.length, 1);
    assert.equal(summary.rockClimbing.length, 1);
    assert.equal(summary.tennis.length, 1);
    assert.equal(summary.weights.length, 1);
    assert.equal(summary.runningMileage, 3);
    assert.equal(summary.walkingMileage, 2);
  });

  it("flags concerning pain and missing data", () => {
    const summary = buildFakeSummary();

    assert.equal(summary.safetyFlags.length, 5);
    assert.equal(
      summary.missingDataFlags.some((flag) => flag.field === "plan-notes.md"),
      false,
    );
  });

  it("renders daily Markdown with unknown and missing values", () => {
    const summary = buildFakeSummary();
    const markdown = renderDailyCheckIn(summary);

    assert.match(markdown, /# Daily Marathon Coach Check-In/);
    assert.doesNotMatch(markdown, /## Athlete Background/);
    assert.match(markdown, /Race: Example City Marathon/);
    assert.match(markdown, /Race date: 2026-11-29/);
    assert.match(markdown, /Race goal: 4:30 stretch goal/);
    assert.match(markdown, /Goal pace: 10:18 min\/mi/);
    assert.match(markdown, /Running mileage: 3 mi/);
    assert.match(markdown, /Walking mileage: 2 mi/);
    assert.match(markdown, /Rock climbing:/);
    assert.match(markdown, /Gear notes: Demo shoes/);
    assert.match(markdown, /## Missing Data Flags/);
    assert.match(markdown, /## Check-In Completeness/);
    assert.match(markdown, /Missing high-value subjective fields: steps/);
    assert.match(markdown, /## Data Quality Notes/);
    assert.match(markdown, /## Safety Flags/);
    assert.match(markdown, /## Plan Notes\s+not provided/);
    assert.match(markdown, /what should I do today/i);
  });

  it("can render the full Athlete Background section when requested", () => {
    const markdown = renderDailyCheckIn(buildFakeSummary(), {
      includeAthleteBackground: true,
    });

    assert.match(markdown, /## Athlete Background/);
    assert.match(markdown, /Athlete: Sample Runner/);
    assert.match(
      markdown,
      /Running background: Fake consistent run-walk background/,
    );
    assert.match(markdown, /Baseline run:/);
    assert.match(markdown, /Recurring cross-training:/);
  });

  it("loads and summarizes fake files without printing raw private input", () => {
    const dir = makeTempProject();
    writeJson(join(dir, "private/athlete.config.local.json"), fakeConfig);
    writeFileSync(
      join(dir, "input/manual/daily-notes.csv"),
      [
        "date,total_steps,leg_soreness_0_10,pain_0_10,pain_location,pain_type,gait_changed,fatigue_0_10,energy_0_10,sleep_quality_0_10,stress_0_10,motivation_0_10,notes",
        "2026-06-26,9000,1,0,none,none,no,2,8,7,3,9,Fake private-style note",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "input/manual/activity-notes.csv"),
      [
        "date,activity_type,duration_minutes,intensity,details,soreness_before_0_10,soreness_after_0_10,next_morning_soreness_0_10,pain_notes,gear,fueling_hydration_notes",
        "2026-06-26,run,30,easy,Fake easy details,1,1,1,none,Demo shoes,water",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "input/manual/manual-activities.csv"),
      [
        "date,source,activity_type,distance_miles,duration_minutes,pace_min_per_mile,elevation_ft,avg_hr,max_hr,steps,notes",
        "2026-06-26,manual,run,3,30,10:00,20,,,4000,Fake run",
      ].join("\n"),
    );
    writeFileSync(join(dir, "input/manual/plan-notes.md"), "Fake plan note");

    const inputs = loadManualInputs({
      dailyNotesPath: join(dir, "input/manual/daily-notes.csv"),
      activityNotesPath: join(dir, "input/manual/activity-notes.csv"),
      manualActivitiesPath: join(dir, "input/manual/manual-activities.csv"),
      planNotesPath: join(dir, "input/manual/plan-notes.md"),
    });
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-27",
        athleteConfig: loadAthleteConfig(dir).config,
        ...inputs,
      }),
    );

    assert.match(markdown, /Fake plan note/);
    assert.equal(
      readFileSync(join(dir, "input/manual/plan-notes.md"), "utf8"),
      "Fake plan note",
    );
    rmSync(dir, { recursive: true, force: true });
  });
});

function buildFakeSummary() {
  return createDailySummary({
    date: "2026-06-27",
    athleteConfig: fakeConfig,
    dailyNotes: [
      {
        date: "2026-06-26",
        totalSteps: null,
        legSoreness: 3,
        pain: 4,
        painLocation: "left calf",
        painType: "sharp",
        gaitChanged: true,
        fatigue: 5,
        energy: 6,
        sleepQuality: 7,
        stress: 3,
        motivation: 8,
        notes: "Pain felt worse late in the day.",
      },
    ],
    activityNotes: [
      {
        date: "2026-06-26",
        activityType: "run",
        durationMinutes: 30,
        intensity: "easy",
        details: "Fake easy run",
        sorenessBefore: 1,
        sorenessAfter: 2,
        nextMorningSoreness: 2,
        painNotes: null,
        gear: "Demo shoes",
        fuelingHydrationNotes: "water",
      },
    ],
    manualActivities: [
      fakeActivity("run", 3),
      fakeActivity("walk", 2),
      fakeActivity("rock_climbing", null),
      fakeActivity("tennis", null),
      fakeActivity("weights", null),
    ],
    planNotes: null,
  });
}

function fakeActivity(activityType: string, distanceMiles: number | null) {
  return {
    date: "2026-06-26",
    source: "manual",
    activityType,
    distanceMiles,
    durationMinutes: 30,
    paceMinPerMile: null,
    elevationFt: null,
    avgHr: null,
    maxHr: null,
    steps: null,
    notes: `Fake ${activityType}`,
  };
}

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "marathon-coach-test-"));
  mkdirSync(join(dir, "private"), { recursive: true });
  mkdirSync(join(dir, "config"), { recursive: true });
  mkdirSync(join(dir, "input/manual"), { recursive: true });
  writeJson(join(dir, "config/athlete.example.json"), fakeConfig);

  return dir;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
