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

    assert.equal(notes[0].totalSteps, "12345");
    assert.equal(notes[0].stepsApprox, 12345);
    assert.equal(notes[0].gaitChanged, true);
    assert.equal(notes[0].pain, 4);
  });

  it("parses compact step text as step load", () => {
    const notes = parseDailyNotes(
      [
        "date,total_steps,leg_soreness_0_10,pain_0_10,pain_location,pain_type,gait_changed,fatigue_0_10,energy_0_10,sleep_quality_0_10,stress_0_10,motivation_0_10,notes",
        "2026-06-26,about 11k,1,0,none,none,no,2,8,7,3,9,Fake note",
      ].join("\n"),
    );

    assert.equal(notes[0].totalSteps, "about 11k");
    assert.equal(notes[0].stepsApprox, 11000);
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

  it("loads local config with a UTF-8 byte order mark", () => {
    const dir = makeTempProject();
    writeFileSync(
      join(dir, "private/athlete.config.local.json"),
      `\ufeff${JSON.stringify(fakeConfig, null, 2)}\n`,
    );

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
    assert.match(markdown, /## Recent Coaching Context/);
    assert.match(markdown, /## Recovery Trend Flags/);
    assert.match(markdown, /## Check-In Completeness/);
    assert.match(markdown, /Missing high-value subjective fields: steps/);
    assert.match(markdown, /## Data Quality Notes/);
    assert.match(markdown, /## Safety Flags/);
    assert.match(markdown, /## Plan Notes\s+not provided/);
    assert.match(markdown, /what should I do today/i);
  });

  it("renders compact recent coaching context from recent local data", () => {
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-29",
        athleteConfig: fakeConfig,
        dailyNotes: [
          fakeDailyNote("2026-06-22", 8000, 3, 0),
          fakeDailyNote("2026-06-23", "about 11k", 2, "none"),
          fakeDailyNote("2026-06-24", 12000, 2, 0),
          fakeDailyNote("2026-06-27", 9000, 1, 0),
          fakeDailyNote("2026-06-28", 7000, 1, 0),
        ],
        activityNotes: [],
        manualActivities: [
          fakeActivityOn("2026-06-16", "run", 2),
          fakeActivityOn("2026-06-23", "run", 3.1),
          fakeActivityOn("2026-06-24", "walk", 2.2),
          fakeActivityOn("2026-06-27", "rock_climbing", null),
          {
            ...fakeActivityOn("2026-06-27", "run", 4),
            source: "strava_fit_export",
            durationMinutes: 44,
            paceMinPerMile: "11:00",
            notes:
              "4/1 run walk; synthetic route-like note 40.123,-75.456 should stay out of recent context",
          },
        ],
        planNotes: null,
      }),
    );

    assert.match(markdown, /Last 7 days: 2 run days/);
    assert.match(markdown, /7.1 running/);
    assert.match(markdown, /1 tracked walk/);
    assert.match(markdown, /2.2 walking/);
    assert.match(markdown, /2 high-step days/);
    assert.match(markdown, /1 climbing session/);
    assert.match(markdown, /Steps are load context, not walking mileage/);
    assert.match(markdown, /Last 14 days: running volume increased/);
    assert.match(markdown, /Recent recovery trend: improving soreness/);
    assert.match(
      markdown,
      /Last run: 2026-06-27, 4 mi run\/walk \(4:1\), 44:00, 11:00 min\/mi/,
    );
    assert.match(markdown, /recovery response soreness 1; pain 0; gait No/);
    assert.match(
      markdown,
      /Load note: climbing on 2026-06-27 occurred on the same day as the 2026-06-27 run/,
    );
    assert.match(markdown, /Route details omitted/);
    assert.doesNotMatch(markdown, /40\.123,-75\.456/);
  });

  it("renders day type and load classification in daily Markdown", () => {
    const markdown = renderDailyCheckIn(
      buildClassificationSummary({
        activities: [fakeActivityOn("2026-06-27", "run", 3)],
      }),
    );

    assert.match(markdown, /## Day Type \/ Load Classification/);
    assert.match(markdown, /Day type: run day/);
    assert.match(markdown, /Load classification: running load/);
  });

  it("classifies common daily load patterns conservatively", () => {
    const cases = [
      {
        name: "true rest day",
        summary: buildClassificationSummary({
          dailyNote: fakeDailyNote("2026-06-27", 3000, 1, 0, "Rest day."),
        }),
        dayType: "true rest day",
        load: "low load",
      },
      {
        name: "missing data no-run day",
        summary: buildClassificationSummary({ dailyNote: null }),
        dayType: "no-run day",
        load: "limited context",
      },
      {
        name: "high-step no-run day",
        summary: buildClassificationSummary({
          dailyNote: fakeDailyNote("2026-06-27", "11k", 1, 0),
        }),
        dayType: "high-step no-run day",
        load: "moderate non-running load",
      },
      {
        name: "moderate-step no-run day",
        summary: buildClassificationSummary({
          dailyNote: fakeDailyNote("2026-06-27", 9000, 1, 0),
        }),
        dayType: "moderate-step no-run day",
        load: "light-to-moderate non-running load",
      },
      {
        name: "run with high steps",
        summary: buildClassificationSummary({
          dailyNote: fakeDailyNote("2026-06-27", "11k", 1, 0),
          activities: [fakeActivityOn("2026-06-27", "run", 3)],
        }),
        dayType: "run day with high step load",
        load: "running load plus high daily movement",
      },
      {
        name: "walk-only day",
        summary: buildClassificationSummary({
          activities: [fakeActivityOn("2026-06-27", "walk", 3)],
        }),
        dayType: "walk-only day",
        load: "walking load, not running mileage",
      },
      {
        name: "climbing-only day",
        summary: buildClassificationSummary({
          activities: [fakeActivityOn("2026-06-27", "rock_climbing", null)],
        }),
        dayType: "climbing day",
        load: "cross-training/strength load",
      },
      {
        name: "strength-only day",
        summary: buildClassificationSummary({
          activities: [fakeActivityOn("2026-06-27", "weights", null)],
        }),
        dayType: "strength day",
        load: "strength load",
      },
      {
        name: "tennis-only day",
        summary: buildClassificationSummary({
          activities: [fakeActivityOn("2026-06-27", "tennis", null)],
        }),
        dayType: "tennis day",
        load: "lateral/impact cross-training load",
      },
      {
        name: "mobility-only day",
        summary: buildClassificationSummary({
          activities: [fakeActivityOn("2026-06-27", "mobility", null)],
        }),
        dayType: "mobility/recovery day",
        load: "low load",
      },
      {
        name: "run plus climbing",
        summary: buildClassificationSummary({
          activities: [
            fakeActivityOn("2026-06-27", "run", 3),
            fakeActivityOn("2026-06-27", "rock_climbing", null),
          ],
        }),
        dayType: "mixed-load day",
        load: "run + climbing",
      },
      {
        name: "run plus weights",
        summary: buildClassificationSummary({
          activities: [
            fakeActivityOn("2026-06-27", "run", 3),
            fakeActivityOn("2026-06-27", "weights", null),
          ],
        }),
        dayType: "mixed-load day",
        load: "run + strength",
      },
      {
        name: "run plus tennis",
        summary: buildClassificationSummary({
          activities: [
            fakeActivityOn("2026-06-27", "run", 3),
            fakeActivityOn("2026-06-27", "tennis", null),
          ],
        }),
        dayType: "mixed-load day",
        load: "run + tennis",
      },
      {
        name: "walking plus climbing",
        summary: buildClassificationSummary({
          activities: [
            fakeActivityOn("2026-06-27", "walk", 2),
            fakeActivityOn("2026-06-27", "rock_climbing", null),
          ],
        }),
        dayType: "mixed non-running load day",
        load: "walking + cross-training",
      },
    ];

    for (const testCase of cases) {
      assert.equal(
        testCase.summary.dayLoadClassification.dayType,
        testCase.dayType,
        testCase.name,
      );
      assert.equal(
        testCase.summary.dayLoadClassification.loadClassification,
        testCase.load,
        testCase.name,
      );
    }
  });

  it("does not count steps as walking mileage or call high-step no-run days rest", () => {
    const summary = buildClassificationSummary({
      dailyNote: fakeDailyNote("2026-06-27", "11k", 1, 0),
    });
    const markdown = renderDailyCheckIn(summary);

    assert.equal(summary.walkingMileage, 0);
    assert.match(markdown, /Walking mileage: 0 mi/);
    assert.match(markdown, /Day type: high-step no-run day/);
    assert.doesNotMatch(markdown, /Day type: true rest day/);
  });

  it("uses high-step no-run wording in recent context instead of journaled rest", () => {
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-29",
        athleteConfig: fakeConfig,
        dailyNotes: [fakeDailyNote("2026-06-28", "11k", 1, 0)],
        activityNotes: [],
        manualActivities: [],
        planNotes: null,
      }),
    );

    assert.match(markdown, /1 high-step no-run day/);
    assert.doesNotMatch(markdown, /journaled rest day/);
  });

  it("uses cautious 14-day trend wording with fewer than three runs", () => {
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-29",
        athleteConfig: fakeConfig,
        dailyNotes: [
          fakeDailyNote("2026-06-27", 9000, 1, 0),
          fakeDailyNote("2026-06-28", 11000, 1, 0),
        ],
        activityNotes: [],
        manualActivities: [
          fakeActivityOn("2026-06-16", "run", 3.1),
          fakeActivityOn("2026-06-27", "run", 3.25),
        ],
        planNotes: null,
      }),
    );

    assert.match(markdown, /Last 14 days: limited running history/);
    assert.doesNotMatch(markdown, /running volume looks roughly stable/);
    assert.doesNotMatch(markdown, /running volume increased/);
  });

  it("includes date-aware high-step load after a run without counting it as walking", () => {
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-29",
        athleteConfig: fakeConfig,
        dailyNotes: [
          fakeDailyNote("2026-06-27", 7000, 1, 0),
          fakeDailyNote("2026-06-28", "11k", 1, 0),
        ],
        activityNotes: [],
        manualActivities: [
          fakeActivityOn("2026-06-27", "run", 3.25),
          fakeActivityOn("2026-06-29", "rock_climbing", null),
        ],
        planNotes: null,
      }),
    );

    assert.match(
      markdown,
      /11k steps on 2026-06-28 added recovery load after the 2026-06-27 run/,
    );
    assert.match(markdown, /Steps are load context, not walking mileage/);
    assert.doesNotMatch(markdown, /2026-06-29.*climbing/);
  });

  it("renders limited recent context when recent data is missing", () => {
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-29",
        athleteConfig: fakeConfig,
        dailyNotes: [],
        activityNotes: [],
        manualActivities: [],
        planNotes: null,
      }),
    );

    assert.match(
      markdown,
      /Recent context limited: not enough prior activity or journal data found/,
    );
  });

  it("renders run/walk structure and avoids stop-start split judgment", () => {
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-28",
        athleteConfig: fakeConfig,
        dailyNotes: [fakeDailyNote("2026-06-27", 8000, 1, 0)],
        activityNotes: [],
        manualActivities: [
          {
            ...fakeActivityOn("2026-06-27", "run", 3.25),
            source: "strava_fit_export",
            durationMinutes: 42.86666666666667,
            paceMinPerMile: "13:12",
            notes: "2.5 min walk warmup + 4/1 run walk + 5 min walk cooldown",
            laps: [
              fakeLap(1, 1, 818),
              fakeLap(2, 1, 727),
              fakeLap(3, 1, 750),
              fakeLap(4, 0.25, 281),
            ],
          },
        ],
        planNotes: null,
      }),
    );

    assert.match(
      markdown,
      /Workout structure: 2\.5 min walk warmup; 4 min run \/ 1 min walk; 5 min walk cooldown\./,
    );
    assert.match(markdown, /planned run\/walk; pace variability expected/);
    assert.match(
      markdown,
      /planned run\/walk format; split variability is expected/,
    );
    assert.match(markdown, /Final partial split may include cooldown\/walking/);
    assert.doesNotMatch(markdown, /uneven \/ stop-start/);
  });

  it("uses journal run/walk fallback and prefers activity notes when sources conflict", () => {
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-28",
        athleteConfig: fakeConfig,
        dailyNotes: [fakeDailyNote("2026-06-27", 8000, 1, 0)],
        activityNotes: [],
        manualActivities: [
          {
            ...fakeActivityOn("2026-06-27", "run", 3),
            notes: "4/1 run walk",
          },
          {
            ...fakeActivityOn("2026-06-27", "run", 2),
            notes: null,
          },
          {
            ...fakeActivityOn("2026-06-27", "walk", 1),
            notes: null,
          },
        ],
        journalEntries: [
          fakeJournalEntry(
            "2026-06-27",
            "5 min warmup, 3:1 run/walk, 5 min cooldown",
          ),
        ],
        planNotes: null,
      }),
    );

    assert.match(markdown, /Workout structure: 4 min run \/ 1 min walk\./);
    assert.match(
      markdown,
      /Workout structure: 5 min walk warmup; 3 min run \/ 1 min walk; 5 min walk cooldown\./,
    );
    assert.match(
      markdown,
      /Workout structure differed between activity description and journal; using activity description\./,
    );
    assert.match(markdown, /- Walks: walk, 1 mi, 30 min/);
    assert.doesNotMatch(markdown, /- Walks:\n\s+- .*Workout structure/);
  });

  it("renders lightweight future workout labels without performance judgment", () => {
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-08-11",
        athleteConfig: fakeConfig,
        dailyNotes: [fakeDailyNote("2026-08-10", 8500, 1, 0)],
        activityNotes: [],
        manualActivities: [
          {
            ...fakeActivityOn("2026-08-10", "run", 3),
            notes: "Easy run/walk 4/1 + 4 x 20 sec relaxed strides",
          },
          {
            ...fakeActivityOn("2026-08-09", "run", 5),
            notes: "3 mi easy + 2 mi marathon effort",
          },
        ],
        planNotes: null,
      }),
    );

    assert.match(
      markdown,
      /Workout structure: easy run\/walk; 4 min run \/ 1 min walk; 4 x 20 sec strides\./,
    );
    assert.match(
      markdown,
      /Last run: 2026-08-10, easy run\/walk with 4 x 20 sec strides, 3 mi run\/walk \(4:1\)/,
    );
    assert.doesNotMatch(markdown, /good|bad|failed|inappropriate/i);
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

function fakeLap(
  lapNumber: number,
  distanceMiles: number,
  durationSeconds: number,
) {
  return {
    lapNumber,
    distanceMiles,
    durationSeconds,
    paceMinPerMile: null,
    avgHr: null,
    maxHr: null,
    elevationGainFt: null,
    avgCadence: null,
  };
}

function fakeJournalEntry(date: string, workoutStructure: string) {
  return {
    date,
    hydration: null,
    fueling: null,
    bodyWeight: null,
    shoes: null,
    equipment: null,
    gearOtherNotes: null,
    workoutStructure,
    runWalkFormat: null,
    coachNotes: null,
    questionsForCoach: null,
  };
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

function fakeActivityOn(
  date: string,
  activityType: string,
  distanceMiles: number | null,
) {
  return {
    ...fakeActivity(activityType, distanceMiles),
    date,
  };
}

function fakeDailyNote(
  date: string,
  totalSteps: number | string | null,
  legSoreness: number | string | null,
  pain: number | string | null,
  notes: string | null = null,
) {
  return {
    date,
    totalSteps,
    legSoreness,
    pain,
    painLocation: null,
    painType: null,
    gaitChanged: false,
    fatigue: 2,
    energy: 7,
    sleepQuality: 7,
    stress: 3,
    motivation: 8,
    notes,
  };
}

function buildClassificationSummary(input: {
  dailyNote?: ReturnType<typeof fakeDailyNote> | null;
  activities?: ReturnType<typeof fakeActivityOn>[];
}) {
  return createDailySummary({
    date: "2026-06-28",
    athleteConfig: fakeConfig,
    dailyNotes:
      input.dailyNote === undefined
        ? [fakeDailyNote("2026-06-27", null, 1, 0)]
        : input.dailyNote === null
          ? []
          : [input.dailyNote],
    activityNotes: [],
    manualActivities: input.activities ?? [],
    planNotes: null,
  });
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
