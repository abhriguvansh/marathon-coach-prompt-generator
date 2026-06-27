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
import { createDailySummary } from "../src/generator/daily-summary";
import { renderDailyCheckIn } from "../src/generator/daily-markdown";
import { createWeeklySummary } from "../src/generator/weekly-summary";
import { renderWeeklySummary } from "../src/generator/weekly-markdown";
import {
  parseLocalExports,
  scanExportFiles,
} from "../src/exports/export-scanner";
import type { AthleteConfig } from "../src/types";

const fixtureRoot = join(process.cwd(), "tests/fixtures/exports");

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
    runningBackground: "Fake export parsing background.",
  },
};

describe("local export parsing", () => {
  it("recursively scans supported and unsupported export files", () => {
    const dir = makeExportProject();
    const scan = scanExportFiles(dir);

    assert.equal(scan.files.length, 5);
    assert.equal(scan.files.filter((file) => file.supported).length, 4);
    assert.equal(scan.files.filter((file) => !file.supported).length, 1);
    assert.equal(
      scan.warnings.some((warning) => warning.extension === ".fit"),
      true,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses CSV, TCX, GPX, and JSON exports into normalized activities", () => {
    const dir = makeExportProject();
    const result = parseLocalExports(dir);

    assert.equal(result.activities.length, 4);
    assert.deepEqual(
      result.activities.map((activity) => activity.source).sort(),
      ["garmin_export", "garmin_export", "strava_export", "strava_export"],
    );
    assert.equal(
      result.activities.some((activity) => activity.activityType === "run"),
      true,
    );
    assert.equal(
      result.activities.some((activity) => activity.activityType === "walk"),
      true,
    );
    assert.equal(
      result.activities.some((activity) => activity.activityType === "weights"),
      true,
    );
    assert.equal(
      result.activities.some((activity) => activity.avgHr === null),
      true,
    );
    assert.equal(
      result.activities.some((activity) => activity.elevationFt === null),
      true,
    );
    assert.equal(
      result.warnings.some((warning) => warning.extension === ".fit"),
      true,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps run and walk mileage separated after export parsing", () => {
    const dir = makeExportProject();
    const result = parseLocalExports(dir);
    const summary = createWeeklySummary({
      weekStart: "2026-06-22",
      athleteConfig: fakeConfig,
      dailyNotes: [],
      activityNotes: [],
      manualActivities: result.activities,
      planNotes: "Fake plan note.",
      exportWarnings: result.warnings,
    });

    assert.equal(Number(summary.totals.runningMileage.toFixed(1)), 7.5);
    assert.equal(Number(summary.totals.walkingMileage.toFixed(1)), 2);
    assert.equal(summary.totals.weightsCount, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("includes parsed exports in daily and weekly Markdown without route coordinates", () => {
    const dir = makeExportProject();
    const result = parseLocalExports(dir);
    const dailyMarkdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-28",
        athleteConfig: fakeConfig,
        dailyNotes: [],
        activityNotes: [],
        manualActivities: result.activities,
        planNotes: "Fake plan note.",
        exportWarnings: result.warnings,
      }),
    );
    const weeklyMarkdown = renderWeeklySummary(
      createWeeklySummary({
        weekStart: "2026-06-22",
        athleteConfig: fakeConfig,
        dailyNotes: [],
        activityNotes: [],
        manualActivities: result.activities,
        planNotes: "Fake plan note.",
        exportWarnings: result.warnings,
      }),
    );

    assert.match(dailyMarkdown, /Running mileage: 4 mi/);
    assert.match(dailyMarkdown, /Walking mileage: 2 mi/);
    assert.match(weeklyMarkdown, /Running mileage: 7.5 mi/);
    assert.match(weeklyMarkdown, /Walking mileage: 2 mi/);
    assert.doesNotMatch(dailyMarkdown, /10\.0000|20\.0000|trkpt|lat=|lon=/);
    assert.doesNotMatch(weeklyMarkdown, /10\.0000|20\.0000|trkpt|lat=|lon=/);
    rmSync(dir, { recursive: true, force: true });
  });
});

function makeExportProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "marathon-export-test-"));
  copyFixture(
    "garmin/sample-garmin.csv",
    join(dir, "input/garmin/sample-garmin.csv"),
  );
  copyFixture(
    "garmin/nested/sample-garmin.tcx",
    join(dir, "input/garmin/nested/sample-garmin.tcx"),
  );
  copyFixture(
    "strava/sample-strava.gpx",
    join(dir, "input/strava/sample-strava.gpx"),
  );
  copyFixture(
    "strava/sample-strava.json",
    join(dir, "input/strava/sample-strava.json"),
  );
  copyFixture(
    "strava/unsupported.fit",
    join(dir, "input/strava/unsupported.fit"),
  );

  return dir;
}

function copyFixture(sourceRelativePath: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(
    destination,
    readFileSync(join(fixtureRoot, sourceRelativePath), "utf8"),
  );
}
