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
import { renderExportParseSummary } from "../src/cli/parse-exports";
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
    assert.equal(scan.files.filter((file) => file.supported).length, 5);
    assert.equal(scan.files.filter((file) => !file.supported).length, 0);
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

  it("parses synthetic FIT walk and run summaries without route data", () => {
    const dir = makeFitProject();
    const result = parseLocalExports(dir);
    const dailyMarkdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-27",
        athleteConfig: fakeConfig,
        dailyNotes: [],
        activityNotes: [],
        manualActivities: result.activities,
        planNotes: null,
        exportWarnings: result.warnings,
      }),
    );
    const weekly = createWeeklySummary({
      weekStart: "2026-06-22",
      athleteConfig: fakeConfig,
      dailyNotes: [],
      activityNotes: [],
      manualActivities: result.activities,
      planNotes: null,
      exportWarnings: result.warnings,
    });
    const parseSummary = renderExportParseSummary(result);
    const walk = result.activities.find(
      (activity) => activity.activityType === "walk",
    );
    const run = result.activities.find(
      (activity) => activity.activityType === "run",
    );

    assert.equal(result.activities.length, 2);
    assert.equal(walk?.source, "strava_fit_export");
    assert.equal(run?.source, "garmin_fit_export");
    assert.equal(Number((walk?.distanceMiles ?? 0).toFixed(2)), 3.86);
    assert.equal(Number((walk?.durationMinutes ?? 0).toFixed(2)), 60.85);
    assert.equal(walk?.paceMinPerMile, "15:46");
    assert.equal(walk?.avgHr, 118);
    assert.equal(walk?.maxHr, 137);
    assert.equal(Number(weekly.totals.walkingMileage.toFixed(2)), 3.86);
    assert.equal(Number(weekly.totals.runningMileage.toFixed(2)), 2.91);
    assert.match(
      dailyMarkdown,
      /Walks: walk, 3\.86 mi, 1:00:51, 15:46 min\/mi, Avg HR 118/,
    );
    assert.match(dailyMarkdown, /Runs: run, 2\.91 mi/);
    assert.doesNotMatch(
      dailyMarkdown,
      /lat=|lon=|trkpt|position_lat|position_long/,
    );
    assert.match(
      parseSummary,
      /walk \| strava_fit_export \| 2026-06-26 \| 3\.86 mi \| 1:00:51 \| 15:46 min\/mi \| route details omitted/,
    );
    assert.doesNotMatch(
      parseSummary,
      /lat=|lon=|trkpt|position_lat|position_long/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("warns and continues when a FIT file cannot be parsed", () => {
    const dir = makeFitProject();
    writeFile(join(dir, "input/strava/corrupt.fit"), "not a fit file");

    const result = parseLocalExports(dir);

    assert.equal(result.activities.length, 2);
    assert.equal(
      result.warnings.some((warning) =>
        warning.message.includes("FIT file could not be parsed"),
      ),
      true,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("prefers FIT session summaries over lap summaries", () => {
    const dir = mkdtempSync(join(tmpdir(), "marathon-fit-lap-test-"));
    writeFile(
      join(dir, "input/garmin/session-with-lap.fit"),
      syntheticFitWithLap(),
    );

    const result = parseLocalExports(dir);
    const activity = result.activities[0];

    assert.equal(result.activities.length, 1);
    assert.equal(activity.source, "garmin_fit_export");
    assert.equal(activity.activityType, "run");
    assert.equal(Number((activity.distanceMiles ?? 0).toFixed(2)), 5);
    assert.equal(Number((activity.durationMinutes ?? 0).toFixed(2)), 50);
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

  it("derives GPX walk distance, duration, and pace from trackpoints", () => {
    const dir = mkdtempSync(join(tmpdir(), "marathon-gpx-derived-test-"));
    writeFile(
      join(dir, "input/strava/derived-walk.gpx"),
      derivedTrackpointGpx(),
    );
    const result = parseLocalExports(dir);
    const activity = result.activities[0];
    const dailyMarkdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-27",
        athleteConfig: fakeConfig,
        dailyNotes: [],
        activityNotes: [],
        manualActivities: result.activities,
        planNotes: null,
        exportWarnings: result.warnings,
      }),
    );
    const parseSummary = renderExportParseSummary(result);

    assert.equal(result.activities.length, 1);
    assert.equal(activity.activityType, "walk");
    assert.equal(Number((activity.distanceMiles ?? 0).toFixed(2)), 3.86);
    assert.equal(Number((activity.durationMinutes ?? 0).toFixed(2)), 60.85);
    assert.equal(activity.paceMinPerMile, "15:46");
    assert.match(dailyMarkdown, /Walks: walk, 3\.86/);
    assert.match(dailyMarkdown, /1:00:51/);
    assert.match(dailyMarkdown, /15:46 min\/mi/);
    assert.match(dailyMarkdown, /Walking mileage: 3\.86 mi/);
    assert.match(dailyMarkdown, /Running mileage: 0 mi/);
    assert.doesNotMatch(dailyMarkdown, /lat=|lon=|trkpt|0\.0559/);
    assert.match(
      parseSummary,
      /walk \| strava_export \| 2026-06-26 \| 3\.86 mi \| 1:00:51 \| 15:46 min\/mi \| route details omitted/,
    );
    assert.doesNotMatch(parseSummary, /lat=|lon=|trkpt|0\.0559/);
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

function makeFitProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "marathon-fit-test-"));
  writeFile(
    join(dir, "input/strava/synthetic-walk.fit"),
    syntheticFitActivity({
      sport: 11,
      dateTime: "2026-06-26T22:00:00Z",
      distanceMiles: 3.86,
      durationSeconds: 3651,
      avgHr: 118,
      maxHr: 137,
      ascentMeters: 30,
      avgCadence: 92,
    }),
  );
  writeFile(
    join(dir, "input/garmin/synthetic-run.fit"),
    syntheticFitActivity({
      sport: 1,
      dateTime: "2026-06-26T12:00:00Z",
      distanceMiles: 2.91,
      durationSeconds: 2294,
      avgHr: 145,
      maxHr: 164,
      ascentMeters: 45,
      avgCadence: 156,
    }),
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

function writeFile(path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function syntheticFitActivity(input: {
  sport: number;
  dateTime: string;
  distanceMiles: number;
  durationSeconds: number;
  avgHr: number;
  maxHr: number;
  ascentMeters: number;
  avgCadence: number;
}): Buffer {
  return syntheticFitFile([
    fitSummaryDefinition(0, 18),
    fitSummaryData(0, input),
  ]);
}

function syntheticFitWithLap(): Buffer {
  return syntheticFitFile([
    fitSummaryDefinition(0, 18),
    fitSummaryData(0, {
      sport: 1,
      dateTime: "2026-06-26T12:00:00Z",
      distanceMiles: 5,
      durationSeconds: 3000,
      avgHr: 145,
      maxHr: 164,
      ascentMeters: 45,
      avgCadence: 156,
    }),
    fitSummaryDefinition(1, 19),
    fitSummaryData(1, {
      sport: 1,
      dateTime: "2026-06-26T12:00:00Z",
      distanceMiles: 1,
      durationSeconds: 600,
      avgHr: 140,
      maxHr: 155,
      ascentMeters: 10,
      avgCadence: 154,
    }),
  ]);
}

function fitSummaryDefinition(
  localMessageType: number,
  globalMessageNumber: number,
): Buffer {
  const definition = Buffer.from([
    0x40 | localMessageType,
    0x00,
    0x00,
    0x00,
    0x00,
    0x08,
    0x02,
    0x04,
    0x86,
    0x05,
    0x01,
    0x02,
    0x08,
    0x04,
    0x86,
    0x09,
    0x04,
    0x86,
    0x15,
    0x02,
    0x84,
    0x10,
    0x01,
    0x02,
    0x11,
    0x01,
    0x02,
    0x12,
    0x01,
    0x02,
  ]);
  definition.writeUInt16LE(globalMessageNumber, 3);

  return definition;
}

function fitSummaryData(
  localMessageType: number,
  input: {
    sport: number;
    dateTime: string;
    distanceMiles: number;
    durationSeconds: number;
    avgHr: number;
    maxHr: number;
    ascentMeters: number;
    avgCadence: number;
  },
): Buffer {
  const data = Buffer.alloc(1 + 4 + 1 + 4 + 4 + 2 + 1 + 1 + 1);
  let offset = 0;
  data.writeUInt8(localMessageType, offset);
  offset += 1;
  data.writeUInt32LE(fitTimestamp(input.dateTime), offset);
  offset += 4;
  data.writeUInt8(input.sport, offset);
  offset += 1;
  data.writeUInt32LE(input.durationSeconds * 1000, offset);
  offset += 4;
  data.writeUInt32LE(Math.round(input.distanceMiles * 1609.344 * 100), offset);
  offset += 4;
  data.writeUInt16LE(input.ascentMeters, offset);
  offset += 2;
  data.writeUInt8(input.avgHr, offset);
  offset += 1;
  data.writeUInt8(input.maxHr, offset);
  offset += 1;
  data.writeUInt8(input.avgCadence, offset);

  return data;
}

function syntheticFitFile(records: Buffer[]): Buffer {
  const fitData = Buffer.concat(records);
  const header = Buffer.alloc(14);
  header.writeUInt8(14, 0);
  header.writeUInt8(16, 1);
  header.writeUInt16LE(0, 2);
  header.writeUInt32LE(fitData.length, 4);
  Buffer.from(".FIT").forEach((byte, index) => {
    header.writeUInt8(byte, 8 + index);
  });

  return Buffer.concat([header, fitData, Buffer.from([0x00, 0x00])]);
}

function fitTimestamp(dateTime: string): number {
  return Math.round((Date.parse(dateTime) - Date.UTC(1989, 11, 31)) / 1000);
}

function derivedTrackpointGpx(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Synthetic Fixture">',
    "  <trk>",
    "    <name>Fake derived walk</name>",
    "    <type>walk</type>",
    "    <trkseg>",
    '      <trkpt lat="0.0000" lon="0.0000"><time>2026-06-26T22:00:00Z</time></trkpt>',
    '      <trkpt lat="0.0000" lon="0.05586"><time>2026-06-26T23:00:51Z</time></trkpt>',
    "    </trkseg>",
    "  </trk>",
    "</gpx>",
  ].join("\n");
}
