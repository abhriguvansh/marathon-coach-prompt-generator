import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeActivityDuplicates } from "../src/generator/duplicate-detection";
import { createDailySummary } from "../src/generator/daily-summary";
import { renderDailyCheckIn } from "../src/generator/daily-markdown";
import { createWeeklySummary } from "../src/generator/weekly-summary";
import { renderWeeklySummary } from "../src/generator/weekly-markdown";
import type { AthleteConfig, ManualActivity } from "../src/types";

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
    runningBackground: "Fake duplicate detection background.",
  },
};

describe("duplicate detection", () => {
  it("detects exact duplicate manual and export activities", () => {
    const analysis = analyzeActivityDuplicates([
      activity("manual", "run", 3, 30),
      activity("garmin_export", "run", 3, 30),
    ]);

    assert.equal(analysis.activitiesForTotals.length, 1);
    assert.equal(analysis.warnings[0].level, "high_confidence");
    assert.equal(analysis.warnings[0].excludedFromTotals, true);
  });

  it("detects near duplicates within tolerance", () => {
    const analysis = analyzeActivityDuplicates([
      activity("manual", "run", 3, 30),
      activity("strava_export", "run", 3.02, 30.5),
    ]);

    assert.equal(analysis.activitiesForTotals.length, 1);
    assert.match(analysis.warnings[0].message, /excluded one likely duplicate/);
  });

  it("does not flag same-day activities with meaningfully different distance", () => {
    const analysis = analyzeActivityDuplicates([
      activity("manual", "run", 3, 30),
      activity("garmin_export", "run", 5, 50),
    ]);

    assert.equal(analysis.activitiesForTotals.length, 2);
    assert.equal(analysis.warnings.length, 0);
  });

  it("does not flag same-distance activities with different type", () => {
    const analysis = analyzeActivityDuplicates([
      activity("manual", "run", 3, 30),
      activity("garmin_export", "walk", 3, 60),
    ]);

    assert.equal(analysis.activitiesForTotals.length, 2);
    assert.equal(analysis.warnings.length, 0);
  });

  it("prefers Garmin FIT over Strava FIT for high-confidence duplicates", () => {
    const analysis = analyzeActivityDuplicates([
      activity("strava_fit_export", "run", 3, 30),
      activity("garmin_fit_export", "run", 3.01, 30.2),
      activity("garmin_fit_export", "run", 6, 60),
    ]);

    assert.equal(analysis.activitiesForTotals.length, 2);
    assert.equal(analysis.activitiesForTotals[0].source, "garmin_fit_export");
    assert.equal(analysis.activitiesForTotals[1].distanceMiles, 6);
    assert.match(
      analysis.warnings[0].message,
      /garmin_fit_export vs strava_fit_export/,
    );
  });

  it("warns but keeps uncertain duplicates in totals", () => {
    const analysis = analyzeActivityDuplicates([
      activity("manual", "run", 3, null),
      activity("garmin_export", "run", 3.01, 35),
    ]);

    assert.equal(analysis.activitiesForTotals.length, 2);
    assert.equal(analysis.warnings[0].level, "uncertain");
    assert.equal(analysis.warnings[0].excludedFromTotals, false);
  });

  it("excludes high-confidence duplicates from daily totals", () => {
    const summary = createDailySummary({
      date: "2026-06-27",
      athleteConfig: fakeConfig,
      dailyNotes: [],
      activityNotes: [],
      manualActivities: [
        activity("manual", "run", 3, 30),
        activity("garmin_export", "run", 3, 30),
        activity("strava_export", "walk", 2, 40),
      ],
      planNotes: "Fake plan note.",
    });
    const markdown = renderDailyCheckIn(summary);

    assert.equal(summary.runningMileage, 3);
    assert.equal(summary.walkingMileage, 2);
    assert.match(markdown, /excluded one likely duplicate from totals/);
    assert.doesNotMatch(markdown, /10\.0000|20\.0000|trkpt|lat=|lon=/);
  });

  it("excludes high-confidence duplicates from weekly totals", () => {
    const summary = createWeeklySummary({
      weekStart: "2026-06-29",
      athleteConfig: fakeConfig,
      dailyNotes: [],
      activityNotes: [],
      manualActivities: [
        activity("manual", "run", 3, 30),
        activity("garmin_export", "run", 3.01, 30.5),
        activity("strava_export", "walk", 2, 40),
      ],
      planNotes: "Fake plan note.",
    });
    const markdown = renderWeeklySummary(summary);

    assert.equal(Number(summary.totals.runningMileage.toFixed(2)), 3);
    assert.equal(summary.totals.walkingMileage, 2);
    assert.match(markdown, /excluded one likely duplicate from totals/);
    assert.doesNotMatch(markdown, /10\.0000|20\.0000|trkpt|lat=|lon=/);
  });
});

function activity(
  source: string,
  activityType: string,
  distanceMiles: number | null,
  durationMinutes: number | null,
): ManualActivity {
  return {
    date: "2026-06-26",
    startTime: "08:00:00",
    source,
    activityType,
    distanceMiles,
    durationMinutes,
    paceMinPerMile: null,
    elevationFt: null,
    avgHr: null,
    maxHr: null,
    steps: null,
    notes: `Fake ${source} ${activityType}`,
  };
}
