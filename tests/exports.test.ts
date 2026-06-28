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

  it("parses rich synthetic FIT summaries and laps without route data", () => {
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
    const weeklyMarkdown = renderWeeklySummary(weekly);
    const walk = result.activities.find(
      (activity) => activity.activityType === "walk",
    );
    const run = result.activities.find(
      (activity) => activity.activityType === "run",
    );

    assert.equal(result.activities.length, 2);
    assert.equal(walk?.source, "strava_fit_export");
    assert.equal(run?.source, "garmin_fit_export");
    assert.equal(Number((walk?.distanceMiles ?? 0).toFixed(2)), 3.87);
    assert.equal(walk?.elapsedTimeSeconds, 3672);
    assert.equal(walk?.movingTimeSeconds, 3588);
    assert.equal(walk?.stoppedTimeSeconds, 84);
    assert.equal(walk?.paceMinPerMile, "15:49");
    assert.equal(walk?.avgHr, 121);
    assert.equal(walk?.maxHr, 144);
    assert.equal(walk?.avgCadence, 108);
    assert.equal(walk?.maxCadence, 118);
    assert.equal(walk?.calories, 286);
    assert.equal(Number((walk?.elevationGainFt ?? 0).toFixed(0)), 85);
    assert.equal(Number((walk?.elevationLossFt ?? 0).toFixed(0)), 72);
    assert.equal(walk?.trainingEffect, 2.3);
    assert.equal(walk?.temperatureC, 22);
    assert.equal(walk?.device, "Garmin Synthetic Watch");
    assert.equal(walk?.laps?.length, 4);
    assert.equal(walk?.laps?.[0]?.paceMinPerMile, "15:32");
    assert.equal(walk?.laps?.[0]?.avgHr, 118);
    assert.equal(Number(weekly.totals.walkingMileage.toFixed(2)), 3.87);
    assert.equal(Number(weekly.totals.runningMileage.toFixed(2)), 2.91);
    assert.equal(
      Number((weekly.totals.walkElevationGainFt ?? 0).toFixed(0)),
      85,
    );
    assert.equal(weekly.totals.totalCalories, 286);
    assert.equal(Math.round(weekly.totals.averageWalkHr ?? 0), 121);
    assert.match(dailyMarkdown, /Walks:/);
    assert.match(
      dailyMarkdown,
      /walk, 3\.87 mi, 1:01:12 elapsed, 59:48 moving, 1:24 stopped\/paused, 15:49 min\/mi, Best pace \d+:\d{2} min\/mi, Avg speed 3\.9 mph, Max speed 4\.3 mph, Avg HR 121, Max HR 144, Elevation gain 85 ft, loss 72 ft, Cadence 108 spm, Max cadence 118 spm, 286 calories, Training effect 2\.3, Temp 22 C, Device Garmin Synthetic Watch, Parsed from local FIT export; route details omitted\./,
    );
    assert.match(
      dailyMarkdown,
      /Splits \/ Laps \(pace variability: mild fade\):/,
    );
    assert.match(dailyMarkdown, /Lap 1: 1\.00 mi, 15:32 min\/mi, Avg HR 118/);
    assert.match(dailyMarkdown, /Final 0\.87 mi: 15:40 min\/mi, Avg HR 123/);
    assert.match(dailyMarkdown, /Runs: run, 2\.91 mi/);
    assert.match(weeklyMarkdown, /Elevation gain from walks: 85\.3 ft/);
    assert.match(weeklyMarkdown, /Average walk HR: 121/);
    assert.match(weeklyMarkdown, /Parsed activity calories: 286/);
    assert.doesNotMatch(
      dailyMarkdown,
      /lat=|lon=|trkpt|position_lat|position_long/,
    );
    assert.doesNotMatch(
      weeklyMarkdown,
      /lat=|lon=|trkpt|position_lat|position_long/,
    );
    assert.match(
      parseSummary,
      /walk \| strava_fit_export \| 2026-06-26 \| 3\.87 mi \| 1:01:12 elapsed \| 59:48 moving \| 1:24 stopped\/paused \| 15:49 min\/mi \| Best pace \d+:\d{2} min\/mi \| Avg speed 3\.9 mph \| Max speed 4\.3 mph \| Avg HR 121 \| Max HR 144 \| Elev 85 ft loss 72 ft \| Cadence 108 spm \| Max cadence 118 spm \| 286 calories \| Training effect 2\.3 \| Device Garmin Synthetic Watch \| route details omitted/,
    );
    assert.match(parseSummary, /laps: 4 privacy-safe lap summaries available/);
    assert.doesNotMatch(
      parseSummary,
      /lat=|lon=|trkpt|position_lat|position_long/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not render a single full-activity FIT lap as useful split data", () => {
    const dir = mkdtempSync(join(tmpdir(), "marathon-fit-full-lap-test-"));
    writeFile(
      join(dir, "input/strava/full-lap.fit"),
      syntheticFitActivity({
        sport: 1,
        dateTime: "2026-06-27T12:00:00Z",
        distanceMiles: 3.25,
        movingSeconds: 2572,
        avgHr: 142,
        maxHr: 160,
        ascentMeters: 62,
        avgCadence: 156,
        laps: [lapInput(1, 3.25, 2572, 142, 160, 62, 156)],
      }),
    );

    const result = parseLocalExports(dir);
    const dailyMarkdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-28",
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
    assert.equal(result.activities[0].laps?.length, 0);
    assert.doesNotMatch(dailyMarkdown, /Splits \/ Laps/);
    assert.doesNotMatch(dailyMarkdown, /Final 3\.25 mi/);
    assert.doesNotMatch(parseSummary, /privacy-safe lap summaries available/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("derives privacy-safe mile splits from FIT record summaries", () => {
    const dir = mkdtempSync(join(tmpdir(), "marathon-fit-record-test-"));
    writeFile(
      join(dir, "input/strava/record-splits.fit"),
      syntheticFitActivity({
        sport: 1,
        dateTime: "2026-06-27T12:00:00Z",
        distanceMiles: 3.24,
        movingSeconds: 2559,
        avgHr: 146,
        maxHr: 164,
        ascentMeters: 62,
        avgCadence: 156,
        manufacturer: 265,
        product: 101,
        records: [
          recordInput(0, 0, 0, 136, 150, 10),
          recordInput(1, 1, 814, 142, 154, 20),
          recordInput(2, 2, 1542, 148, 158, 30),
          recordInput(3, 3, 2293, 152, 160, 50),
          recordInput(4, 3.24, 2559, 154, 148, 52),
        ],
      }),
    );

    const result = parseLocalExports(dir);
    const activity = result.activities[0];
    const dailyMarkdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-28",
        athleteConfig: fakeConfig,
        dailyNotes: [],
        activityNotes: [],
        manualActivities: result.activities,
        planNotes: null,
        exportWarnings: result.warnings,
      }),
    );
    const parseSummary = renderExportParseSummary(result);

    assert.equal(activity.laps?.length, 4);
    assert.equal(activity.device, null);
    assert.match(
      dailyMarkdown,
      /Splits \/ Laps \(pace variability: uneven \/ stop-start\):/,
    );
    assert.match(dailyMarkdown, /Mile 1: 1\.00 mi, 13:34 min\/mi/);
    assert.match(dailyMarkdown, /Mile 2: 1\.00 mi, 12:08 min\/mi/);
    assert.match(dailyMarkdown, /Mile 3: 1\.00 mi, 12:31 min\/mi/);
    assert.match(dailyMarkdown, /Final 0\.24 mi: 18:28 min\/mi/);
    assert.doesNotMatch(dailyMarkdown, /Device Manufacturer|product 101/);
    assert.match(parseSummary, /laps: 4 privacy-safe lap summaries available/);
    assert.doesNotMatch(parseSummary, /Device Manufacturer|product 101/);
    assert.doesNotMatch(
      dailyMarkdown,
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
      distanceMiles: 3.87,
      movingSeconds: 3588,
      elapsedSeconds: 3672,
      avgHr: 121,
      maxHr: 144,
      ascentMeters: 26,
      descentMeters: 22,
      avgCadence: 108,
      maxCadence: 118,
      calories: 286,
      trainingEffect: 2.3,
      temperatureC: 22,
      deviceName: "Synthetic Watch",
      laps: [
        lapInput(1, 1, 932, 118, 132, 6, 106),
        lapInput(2, 1, 948, 122, 138, 7, 108),
        lapInput(3, 1, 965, 125, 142, 8, 109),
        lapInput(4, 0.87, 818, 123, 144, 5, 107),
      ],
    }),
  );
  writeFile(
    join(dir, "input/garmin/synthetic-run.fit"),
    syntheticFitActivity({
      sport: 1,
      dateTime: "2026-06-26T12:00:00Z",
      distanceMiles: 2.91,
      movingSeconds: 2294,
      avgHr: 145,
      maxHr: 164,
      ascentMeters: 45,
      descentMeters: 42,
      avgCadence: 156,
      maxCadence: 168,
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
  movingSeconds: number;
  elapsedSeconds?: number;
  avgHr: number;
  maxHr: number;
  ascentMeters: number;
  descentMeters?: number;
  avgCadence: number;
  maxCadence?: number;
  calories?: number;
  trainingEffect?: number;
  temperatureC?: number;
  deviceName?: string;
  manufacturer?: number;
  product?: number;
  laps?: Array<{
    lapNumber: number;
    distanceMiles: number;
    durationSeconds: number;
    avgHr: number;
    maxHr: number;
    ascentMeters: number;
    avgCadence: number;
  }>;
  records?: Array<{
    recordNumber: number;
    distanceMiles: number;
    timestampOffsetSeconds: number;
    heartRate: number;
    cadence: number;
    altitudeMeters: number;
  }>;
}): Buffer {
  return syntheticFitFile([
    fitSummaryDefinition(0, 18),
    fitSummaryData(0, input),
    ...(input.deviceName || input.manufacturer || input.product
      ? [
          fitDeviceDefinition(2),
          fitDeviceData(2, {
            deviceName: input.deviceName,
            manufacturer: input.manufacturer ?? 1,
            product: input.product ?? 999,
          }),
        ]
      : []),
    ...(input.records
      ? [
          fitRecordDefinition(14),
          ...input.records.map((record) =>
            fitRecordData(14, input.dateTime, record),
          ),
        ]
      : []),
    ...(input.laps ?? []).flatMap((lap, index) => [
      fitSummaryDefinition(index + 3, 19),
      fitSummaryData(index + 3, {
        sport: input.sport,
        dateTime: input.dateTime,
        distanceMiles: lap.distanceMiles,
        movingSeconds: lap.durationSeconds,
        avgHr: lap.avgHr,
        maxHr: lap.maxHr,
        ascentMeters: lap.ascentMeters,
        avgCadence: lap.avgCadence,
      }),
    ]),
  ]);
}

function recordInput(
  recordNumber: number,
  distanceMiles: number,
  timestampOffsetSeconds: number,
  heartRate: number,
  cadence: number,
  altitudeMeters: number,
) {
  return {
    recordNumber,
    distanceMiles,
    timestampOffsetSeconds,
    heartRate,
    cadence,
    altitudeMeters,
  };
}

function syntheticFitWithLap(): Buffer {
  return syntheticFitFile([
    fitSummaryDefinition(0, 18),
    fitSummaryData(0, {
      sport: 1,
      dateTime: "2026-06-26T12:00:00Z",
      distanceMiles: 5,
      movingSeconds: 3000,
      avgHr: 145,
      maxHr: 164,
      ascentMeters: 45,
      descentMeters: 40,
      avgCadence: 156,
    }),
    fitSummaryDefinition(1, 19),
    fitSummaryData(1, {
      sport: 1,
      dateTime: "2026-06-26T12:00:00Z",
      distanceMiles: 1,
      movingSeconds: 600,
      avgHr: 140,
      maxHr: 155,
      ascentMeters: 10,
      descentMeters: 8,
      avgCadence: 154,
    }),
  ]);
}

function lapInput(
  lapNumber: number,
  distanceMiles: number,
  durationSeconds: number,
  avgHr: number,
  maxHr: number,
  ascentMeters: number,
  avgCadence: number,
) {
  return {
    lapNumber,
    distanceMiles,
    durationSeconds,
    avgHr,
    maxHr,
    ascentMeters,
    avgCadence,
  };
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
    0x10,
    0x02,
    0x04,
    0x86,
    0x05,
    0x01,
    0x02,
    0x07,
    0x04,
    0x86,
    0x08,
    0x04,
    0x86,
    0x09,
    0x04,
    0x86,
    0x0b,
    0x02,
    0x84,
    0x0e,
    0x02,
    0x84,
    0x0f,
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
    0x13,
    0x01,
    0x02,
    0x14,
    0x01,
    0x01,
    0x15,
    0x02,
    0x84,
    0x16,
    0x02,
    0x84,
    0x18,
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
    movingSeconds: number;
    elapsedSeconds?: number;
    avgHr: number;
    maxHr: number;
    ascentMeters: number;
    descentMeters?: number;
    avgCadence: number;
    maxCadence?: number;
    calories?: number;
    trainingEffect?: number;
    temperatureC?: number;
  },
): Buffer {
  const data = Buffer.alloc(
    1 + 4 + 1 + 4 + 4 + 4 + 2 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 2 + 2 + 1,
  );
  let offset = 0;
  data.writeUInt8(localMessageType, offset);
  offset += 1;
  data.writeUInt32LE(fitTimestamp(input.dateTime), offset);
  offset += 4;
  data.writeUInt8(input.sport, offset);
  offset += 1;
  data.writeUInt32LE(
    (input.elapsedSeconds ?? input.movingSeconds) * 1000,
    offset,
  );
  offset += 4;
  data.writeUInt32LE(input.movingSeconds * 1000, offset);
  offset += 4;
  data.writeUInt32LE(Math.round(input.distanceMiles * 1609.344 * 100), offset);
  offset += 4;
  data.writeUInt16LE(input.calories ?? 0xffff, offset);
  offset += 2;
  data.writeUInt16LE(
    Math.round((input.distanceMiles * 1609.344 * 1000) / input.movingSeconds),
    offset,
  );
  offset += 2;
  data.writeUInt16LE(
    Math.round(
      ((input.distanceMiles * 1609.344 * 1000) / input.movingSeconds) * 1.12,
    ),
    offset,
  );
  offset += 2;
  data.writeUInt8(input.avgHr, offset);
  offset += 1;
  data.writeUInt8(input.maxHr, offset);
  offset += 1;
  data.writeUInt8(input.avgCadence, offset);
  offset += 1;
  data.writeUInt8(input.maxCadence ?? 0xff, offset);
  offset += 1;
  data.writeUInt8(input.temperatureC ?? 0xff, offset);
  offset += 1;
  data.writeUInt16LE(input.ascentMeters, offset);
  offset += 2;
  data.writeUInt16LE(input.descentMeters ?? 0xffff, offset);
  offset += 2;
  data.writeUInt8(
    input.trainingEffect === undefined
      ? 0xff
      : Math.round(input.trainingEffect * 10),
    offset,
  );

  return data;
}

function fitDeviceDefinition(localMessageType: number): Buffer {
  const definition = Buffer.from([
    0x40 | localMessageType,
    0x00,
    0x00,
    0x17,
    0x00,
    0x03,
    0x02,
    0x02,
    0x84,
    0x04,
    0x02,
    0x84,
    0x1b,
    0x10,
    0x07,
  ]);

  return definition;
}

function fitDeviceData(
  localMessageType: number,
  input: {
    deviceName?: string;
    manufacturer: number;
    product: number;
  },
): Buffer {
  const data = Buffer.alloc(1 + 2 + 2 + 16);
  const name = Buffer.from(input.deviceName ?? "");

  data.writeUInt8(localMessageType, 0);
  data.writeUInt16LE(input.manufacturer, 1);
  data.writeUInt16LE(input.product, 3);
  name.subarray(0, 16).forEach((byte, index) => {
    data.writeUInt8(byte, 5 + index);
  });

  return data;
}

function fitRecordDefinition(localMessageType: number): Buffer {
  return Buffer.from([
    0x40 | localMessageType,
    0x00,
    0x00,
    0x14,
    0x00,
    0x05,
    0xfd,
    0x04,
    0x86,
    0x05,
    0x04,
    0x86,
    0x03,
    0x01,
    0x02,
    0x04,
    0x01,
    0x02,
    0x02,
    0x02,
    0x84,
  ]);
}

function fitRecordData(
  localMessageType: number,
  startDateTime: string,
  input: {
    distanceMiles: number;
    timestampOffsetSeconds: number;
    heartRate: number;
    cadence: number;
    altitudeMeters: number;
  },
): Buffer {
  const data = Buffer.alloc(1 + 4 + 4 + 1 + 1 + 2);
  let offset = 0;

  data.writeUInt8(localMessageType, offset);
  offset += 1;
  data.writeUInt32LE(
    fitTimestamp(startDateTime) + input.timestampOffsetSeconds,
    offset,
  );
  offset += 4;
  data.writeUInt32LE(Math.round(input.distanceMiles * 1609.344 * 100), offset);
  offset += 4;
  data.writeUInt8(input.heartRate, offset);
  offset += 1;
  data.writeUInt8(input.cadence, offset);
  offset += 1;
  data.writeUInt16LE(Math.round((input.altitudeMeters + 500) * 5), offset);

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
