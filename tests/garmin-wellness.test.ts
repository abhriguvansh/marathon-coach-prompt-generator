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
import { deflateRawSync } from "node:zlib";
import { describe, it } from "node:test";
import { renderDailyCheckIn } from "../src/generator/daily-markdown";
import { createDailySummary } from "../src/generator/daily-summary";
import { renderWeeklySummary } from "../src/generator/weekly-markdown";
import { createWeeklySummary } from "../src/generator/weekly-summary";
import {
  formatGarminWellnessImportReport,
  importGarminWellness,
} from "../src/garmin-wellness/importer";
import { readFitEntriesFromZip } from "../src/garmin-wellness/zip-reader";
import { parseJournal } from "../src/parsers/journal";
import type { AthleteConfig, DailyNote } from "../src/types";

const fakeConfig: AthleteConfig = {
  athleteName: "Sample Runner",
  timezone: "America/New_York",
  race: {
    name: "Example City Marathon",
    date: "2026-11-29",
    goalTime: "4:30 stretch goal",
    goalPace: "10:18 min/mi",
  },
  background: {
    experienceLevel: "beginner",
    runningBackground: "Fake wellness background.",
  },
};

describe("Garmin wellness import", () => {
  it("reads a wellness ZIP directly and populates blank journal fields", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/garmin/wellness/garmin-wellness-2026-07-01.zip"),
      zipFile([
        {
          name: "454995658802_WELLNESS.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-01T12:00:00Z",
            steps: 14032,
            sleepDurationMinutes: 342,
            sleepScore: 61,
            restingHeartRate: 57,
            overnightHrv: 42,
            hrvStatus: "balanced",
            garminStress: 35,
            bodyBatteryWaking: 68,
            bodyBatteryHigh: 82,
            bodyBatteryLow: 24,
          }),
        },
        { name: "notes.txt", content: Buffer.from("ignored") },
      ]),
    );

    const result = importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "America/New_York",
    });
    const journal = readFileSync(
      join(dir, "input/journal/2026-07-01.md"),
      "utf8",
    );

    assert.equal(result.zipFilesFound, 1);
    assert.equal(result.fitFilesDecoded, 1);
    assert.equal(result.ignoredEntries, 1);
    assert.deepEqual(result.fieldsPopulated.sort(), [
      "Body Battery",
      "Garmin Stress",
      "HRV Status",
      "Overnight HRV",
      "Resting Heart Rate",
      "Sleep Duration",
      "Sleep Score",
      "Total Steps",
    ]);
    assert.match(journal, /Total Steps: 14,032/);
    assert.match(journal, /Sleep Duration: 5h 42m/);
    assert.match(journal, /Sleep Score: 61/);
    assert.match(journal, /Resting Heart Rate: 57 bpm/);
    assert.match(journal, /Overnight HRV: 42 ms/);
    assert.match(journal, /HRV Status: balanced/);
    assert.match(journal, /Garmin Stress: 35/);
    assert.match(journal, /Body Battery: 68 on waking/);
    assert.doesNotMatch(journal, /raw FIT|device serial|user id/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses athlete-local date instead of ZIP filename or UTC date", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/garmin/wellness/2026-07-02.zip"),
      zipFile([
        {
          name: "late_WELLNESS.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-02T02:15:00Z",
            steps: 15000,
          }),
        },
      ]),
    );

    const localDate = importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "America/New_York",
    });
    const utcDate = importGarminWellness({
      cwd: dir,
      date: "2026-07-02",
      timezone: "America/New_York",
    });

    assert.equal(localDate.fieldsPopulated.includes("Total Steps"), true);
    assert.equal(utcDate.fieldsPopulated.includes("Total Steps"), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a dated Garmin wellness ZIP directly under input/garmin", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/garmin/2026-07-01.zip"),
      zipFile([
        {
          name: "454995658802_WELLNESS.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-01T12:00:00Z",
            steps: 14032,
          }),
        },
      ]),
    );

    const result = importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "America/New_York",
    });

    assert.equal(result.zipFilesFound, 1);
    assert.equal(result.fitFilesDecoded, 1);
    assert.equal(result.fieldsPopulated.includes("Total Steps"), true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("imports trusted sleep summary using local wake date", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/garmin/2026-07-03.zip"),
      zipFile([
        {
          name: "fake-sleep.fit",
          content: syntheticFitRecords([
            {
              globalMessageNumber: 346,
              fields: [uint8Field(14, 75)],
            },
            {
              globalMessageNumber: 275,
              fields: [
                uint32Field(253, fitTimestamp("2026-07-03T04:00:00Z")),
                uint8Field(0, 2),
              ],
            },
            {
              globalMessageNumber: 275,
              fields: [
                uint32Field(253, fitTimestamp("2026-07-03T07:15:00Z")),
                uint8Field(0, 3),
              ],
            },
            {
              globalMessageNumber: 275,
              fields: [
                uint32Field(253, fitTimestamp("2026-07-03T10:45:00Z")),
                uint8Field(0, 1),
              ],
            },
          ]),
        },
      ]),
    );

    const result = importGarminWellness({
      cwd: dir,
      date: "2026-07-03",
      timezone: "America/New_York",
      debug: true,
    });
    const journal = readFileSync(
      join(dir, "input/journal/2026-07-03.md"),
      "utf8",
    );
    const report = formatGarminWellnessImportReport(result);

    assert.match(journal, /Sleep Duration: 6h 45m/);
    assert.match(journal, /Sleep Score: 75/);
    assert.match(report, /daily sleep summary selected/);
    assert.match(
      report,
      /sleep assigned to 2026-07-03 by local wake timestamp/,
    );
    assert.doesNotMatch(report, /fake-sleep|2026-07-03\.zip/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects unavailable sleep score, HRV sentinel, unknown status, and short sleep segments", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/garmin/2026-07-01.zip"),
      zipFile([
        {
          name: "fake-invalid-values.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-01T12:00:00Z",
            steps: 14032,
            sleepDurationMinutes: 6,
            sleepScore: 0,
            overnightHrv: 255,
            hrvStatus: "unknown",
          }),
        },
        {
          name: "fake-stage.fit",
          content: syntheticFitFile(410, [
            uint32Field(253, fitTimestamp("2026-07-01T12:05:00Z")),
            uint16Field(0, 6),
          ]),
        },
      ]),
    );

    const result = importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "America/New_York",
    });
    const journal = readFileSync(
      join(dir, "input/journal/2026-07-01.md"),
      "utf8",
    );

    assert.match(journal, /Total Steps: 14,032/);
    assert.doesNotMatch(journal, /Sleep Duration: 0h 6m/);
    assert.doesNotMatch(journal, /Sleep Score: 0/);
    assert.doesNotMatch(journal, /Overnight HRV: 255 ms/);
    assert.doesNotMatch(journal, /HRV Status: unknown/);
    assert.equal(
      result.warnings.some((warning) => warning.includes("Sleep score")),
      true,
    );
    assert.equal(
      result.warnings.some((warning) => warning.includes("Overnight HRV")),
      true,
    );
    assert.equal(
      result.warnings.some((warning) => warning.includes("HRV status")),
      true,
    );
    assert.equal(
      result.warnings.some((warning) => warning.includes("sleep-stage")),
      true,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses only the trusted daily summary field for resting heart rate", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/garmin/2026-07-01.zip"),
      zipFile([
        {
          name: "fake-monitoring-sample.fit",
          content: syntheticFitFile(55, [
            uint32Field(253, fitTimestamp("2026-07-01T12:00:00Z")),
            uint8Field(0, 113),
          ]),
        },
        {
          name: "fake-daily-summary.fit",
          content: syntheticFitFile(411, [
            uint32Field(253, fitTimestamp("2026-07-01T12:10:00Z")),
            uint8Field(13, 57),
          ]),
        },
        {
          name: "fake-steps.fit",
          content: syntheticFitFile(103, [
            uint32Field(253, fitTimestamp("2026-07-01T12:20:00Z")),
            uint32Field(3, 14032),
          ]),
        },
      ]),
    );

    importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "America/New_York",
    });
    const journal = readFileSync(
      join(dir, "input/journal/2026-07-01.md"),
      "utf8",
    );

    assert.match(journal, /Resting Heart Rate: 57 bpm/);
    assert.doesNotMatch(journal, /Resting Heart Rate: 113 bpm/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates journals with imported activity references when wellness import creates the journal", () => {
    const dir = makeProject();
    writeJson(join(dir, "input/strava/fake-run.json"), {
      activities: [
        {
          date: "2026-07-01T09:00:00Z",
          activityType: "run",
          durationMinutes: 44,
          distanceMiles: 2.93,
          elevationFt: null,
          avgHr: null,
          maxHr: null,
        },
      ],
    });
    writeFile(
      join(dir, "input/garmin/2026-07-01.zip"),
      zipFile([
        {
          name: "fake-wellness.fit",
          content: syntheticFitFile(103, [
            uint32Field(253, fitTimestamp("2026-07-01T12:00:00Z")),
            uint32Field(3, 14032),
          ]),
        },
      ]),
    );

    const first = importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "UTC",
    });
    const journalPath = join(dir, "input/journal/2026-07-01.md");
    const created = readFileSync(journalPath, "utf8");
    const second = importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "UTC",
    });

    assert.equal(first.journalCreated, true);
    assert.match(created, /Run - 2.93 mi - 44:00/);
    assert.doesNotMatch(created, /No imported activities found/);
    assert.equal(second.journalCreated, false);
    assert.equal(readFileSync(journalPath, "utf8"), created);
    rmSync(dir, { recursive: true, force: true });
  });

  it("supports privacy-safe debug notes without raw records or filenames", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/garmin/2026-07-01.zip"),
      zipFile([
        {
          name: "454995658802_WELLNESS.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-01T12:00:00Z",
            steps: 14032,
          }),
        },
      ]),
    );

    const report = formatGarminWellnessImportReport(
      importGarminWellness({
        cwd: dir,
        date: "2026-07-01",
        timezone: "America/New_York",
        debug: true,
      }),
    );

    assert.match(report, /Debug notes:/);
    assert.match(report, /Observed FIT message types:/);
    assert.match(report, /Selection logic:/);
    assert.doesNotMatch(
      report,
      /454995658802|raw record|position_lat|position_long/i,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("preserves manual values and warns only on material step conflicts", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/journal/2026-07-01.md"),
      [
        "# Daily Journal",
        "",
        "Date: 2026-07-01",
        "",
        "## Recovery",
        "",
        "Sleep: poor",
        "Stress (0-10 or words): normal",
        "Total Steps: 8k",
        "",
        "## Manual Activities",
        "",
        "Custom fake note stays here.",
      ].join("\n"),
    );
    writeFile(
      join(dir, "input/garmin/wellness/2026-07-01.zip"),
      zipFile([
        {
          name: "454924711612_METRICS.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-01T12:00:00Z",
            steps: 14032,
            sleepDurationMinutes: 342,
            sleepScore: 61,
            garminStress: 35,
          }),
        },
      ]),
    );

    const result = importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "America/New_York",
    });
    const journal = readFileSync(
      join(dir, "input/journal/2026-07-01.md"),
      "utf8",
    );

    assert.match(journal, /Sleep: poor/);
    assert.match(journal, /Stress \(0-10 or words\): normal/);
    assert.match(journal, /Total Steps: 8k/);
    assert.match(journal, /Garmin Stress: 35/);
    assert.match(journal, /Custom fake note stays here/);
    assert.equal(result.fieldsPreserved.includes("Total Steps"), true);
    assert.equal(
      result.warnings.some((warning) =>
        warning.includes("Manual steps differ materially"),
      ),
      true,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("clears previously imported untrusted structured values while preserving plausible manual values", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/journal/2026-07-01.md"),
      [
        "# Daily Journal",
        "",
        "Date: 2026-07-01",
        "",
        "## Recovery",
        "",
        "Sleep: poor",
        "Sleep Duration: 0h 6m",
        "Sleep Score: 0",
        "Resting Heart Rate: 113 bpm",
        "Overnight HRV: 255 ms",
        "HRV Status: unknown",
        "Energy (0-10 or words): low",
        "Total Steps:",
      ].join("\n"),
    );
    writeFile(
      join(dir, "input/garmin/2026-07-01.zip"),
      zipFile([
        {
          name: "fake-steps.fit",
          content: syntheticFitFile(103, [
            uint32Field(253, fitTimestamp("2026-07-01T12:00:00Z")),
            uint32Field(3, 14032),
          ]),
        },
      ]),
    );

    const result = importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "America/New_York",
    });
    const journal = readFileSync(
      join(dir, "input/journal/2026-07-01.md"),
      "utf8",
    );

    assert.match(journal, /Sleep: poor/);
    assert.match(journal, /Energy \(0-10 or words\): low/);
    assert.match(journal, /^Sleep Duration:\s*$/m);
    assert.match(journal, /^Sleep Score:\s*$/m);
    assert.match(journal, /^Resting Heart Rate:\s*$/m);
    assert.match(journal, /^Overnight HRV:\s*$/m);
    assert.match(journal, /^HRV Status:\s*$/m);
    assert.match(journal, /Total Steps: 14,032/);
    assert.equal(
      result.warnings.some((warning) => warning.includes("cleared")),
      true,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("is idempotent and does not duplicate missing fields", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/journal/2026-07-01.md"),
      "# Daily Journal\n\nDate: 2026-07-01\n\n## Recovery\n\nTotal Steps:\n\n## Coach Notes\n\nFake note.",
    );
    writeFile(
      join(dir, "input/garmin/wellness/2026-07-01.zip"),
      zipFile([
        {
          name: "454995658802_WELLNESS.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-01T12:00:00Z",
            steps: 14032,
            restingHeartRate: 57,
          }),
        },
      ]),
    );

    importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "America/New_York",
    });
    const first = readFileSync(
      join(dir, "input/journal/2026-07-01.md"),
      "utf8",
    );
    importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "America/New_York",
    });
    const second = readFileSync(
      join(dir, "input/journal/2026-07-01.md"),
      "utf8",
    );

    assert.equal(second, first);
    assert.equal(matchCount(second, "Resting Heart Rate:"), 1);
    assert.equal(matchCount(second, "Total Steps:"), 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("handles corrupt FIT files among valid files and rejects traversal ZIP entries", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/garmin/wellness/2026-07-01.zip"),
      zipFile([
        {
          name: "valid_WELLNESS.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-01T12:00:00Z",
            steps: 14032,
          }),
        },
        { name: "corrupt_WELLNESS.fit", content: Buffer.from("not fit") },
      ]),
    );

    const result = importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "America/New_York",
    });

    assert.equal(result.fitFilesDecoded, 1);
    assert.equal(result.fitFilesSkipped, 1);
    assert.equal(result.fieldsPopulated.includes("Total Steps"), true);
    assert.throws(
      () =>
        readFitEntriesFromZip(
          zipFile([{ name: "../unsafe.fit", content: Buffer.from("x") }]),
        ),
      /unsafe entry path/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("renders Garmin wellness metrics in daily and weekly Markdown", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/garmin/wellness/2026-07-01.zip"),
      zipFile([
        {
          name: "454995658802_WELLNESS.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-01T12:00:00Z",
            steps: 14032,
            sleepDurationMinutes: 342,
            sleepScore: 61,
            restingHeartRate: 57,
            overnightHrv: 42,
            hrvStatus: "balanced",
            garminStress: 35,
            bodyBatteryWaking: 68,
          }),
        },
      ]),
    );
    importGarminWellness({
      cwd: dir,
      date: "2026-07-01",
      timezone: "America/New_York",
    });
    const parsed = parseJournal(
      readFileSync(join(dir, "input/journal/2026-07-01.md"), "utf8"),
      "2026-07-01",
    );
    const daily = renderDailyCheckIn(
      createDailySummary({
        date: "2026-07-02",
        athleteConfig: fakeConfig,
        dailyNotes: [parsed.dailyNote],
        activityNotes: [],
        manualActivities: [],
        planNotes: null,
        journalEntries: [parsed.journalEntry],
      }),
    );
    const weekly = renderWeeklySummary(
      createWeeklySummary({
        weekStart: "2026-07-06",
        athleteConfig: fakeConfig,
        dailyNotes: [parsed.dailyNote],
        activityNotes: [],
        manualActivities: [],
        planNotes: null,
        journalEntries: [parsed.journalEntry],
      }),
    );

    assert.match(daily, /Sleep duration: 5h 42m/);
    assert.match(daily, /Sleep score: 61/);
    assert.match(daily, /Resting heart rate: 57 bpm/);
    assert.match(daily, /Overnight HRV: 42 ms/);
    assert.match(daily, /Garmin stress: 35/);
    assert.match(daily, /Body Battery: 68 on waking/);
    assert.doesNotMatch(
      daily,
      /Missing high-value subjective fields:.*steps|Missing high-value subjective fields:.*sleep/,
    );
    assert.match(daily, /Missing high-value subjective fields: soreness/);
    assert.match(weekly, /## Garmin Wellness Summary/);
    assert.match(weekly, /Coverage: 1\/7 days/);
    assert.match(weekly, /Sleep duration: average 5h 42m/);
    assert.doesNotMatch(`${daily}\n${weekly}`, /readiness score|diagnosis/i);
    rmSync(dir, { recursive: true, force: true });
  });
});

function makeProject(): string {
  return mkdtempSync(join(tmpdir(), "marathon-wellness-test-"));
}

function writeFile(path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function writeJson(path: string, value: unknown): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function matchCount(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}

function syntheticWellnessFit(input: {
  dateTime: string;
  steps?: number;
  sleepDurationMinutes?: number;
  sleepScore?: number;
  restingHeartRate?: number;
  overnightHrv?: number;
  hrvStatus?: string;
  garminStress?: number;
  bodyBatteryWaking?: number;
  bodyBatteryHigh?: number;
  bodyBatteryLow?: number;
}): Buffer {
  const fields = [
    uint32Field(253, fitTimestamp(input.dateTime)),
    uint32Field(100, input.steps),
    uint16Field(101, input.sleepDurationMinutes),
    uint8Field(102, input.sleepScore),
    uint8Field(103, input.restingHeartRate),
    uint16Field(104, input.overnightHrv),
    stringField(105, input.hrvStatus, 16),
    uint8Field(106, input.garminStress),
    uint8Field(108, input.bodyBatteryHigh),
    uint8Field(109, input.bodyBatteryLow),
    uint8Field(110, input.bodyBatteryWaking),
  ];

  return syntheticFitFile(65280, fields);
}

interface FitField {
  fieldNumber: number;
  size: number;
  baseType: number;
  write(data: Buffer, offset: number): void;
}

function uint8Field(fieldNumber: number, value: number | undefined): FitField {
  return {
    fieldNumber,
    size: 1,
    baseType: 0x02,
    write(data, offset) {
      data.writeUInt8(value ?? 0xff, offset);
    },
  };
}

function uint16Field(fieldNumber: number, value: number | undefined): FitField {
  return {
    fieldNumber,
    size: 2,
    baseType: 0x84,
    write(data, offset) {
      data.writeUInt16LE(value ?? 0xffff, offset);
    },
  };
}

function uint32Field(fieldNumber: number, value: number | undefined): FitField {
  return {
    fieldNumber,
    size: 4,
    baseType: 0x86,
    write(data, offset) {
      data.writeUInt32LE(value ?? 0xffffffff, offset);
    },
  };
}

function stringField(
  fieldNumber: number,
  value: string | undefined,
  size: number,
): FitField {
  return {
    fieldNumber,
    size,
    baseType: 0x07,
    write(data, offset) {
      Buffer.from(value ?? "")
        .subarray(0, size)
        .forEach((byte, index) => {
          data.writeUInt8(byte, offset + index);
        });
    },
  };
}

function syntheticFitFile(
  globalMessageNumber: number,
  fields: FitField[],
): Buffer {
  return syntheticFitRecords([{ globalMessageNumber, fields }]);
}

function syntheticFitRecords(
  records: Array<{ globalMessageNumber: number; fields: FitField[] }>,
): Buffer {
  const fitRecords = records.flatMap((record, index) =>
    syntheticFitRecord(index, record.globalMessageNumber, record.fields),
  );
  const fitData = Buffer.concat(fitRecords);
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

function syntheticFitRecord(
  localMessageType: number,
  globalMessageNumber: number,
  fields: FitField[],
): Buffer[] {
  const definition = Buffer.alloc(1 + 1 + 1 + 2 + 1 + fields.length * 3);
  let definitionOffset = 0;
  definition.writeUInt8(0x40 | localMessageType, definitionOffset);
  definitionOffset += 1;
  definition.writeUInt8(0, definitionOffset);
  definitionOffset += 1;
  definition.writeUInt8(0, definitionOffset);
  definitionOffset += 1;
  definition.writeUInt16LE(globalMessageNumber, definitionOffset);
  definitionOffset += 2;
  definition.writeUInt8(fields.length, definitionOffset);
  definitionOffset += 1;

  for (const field of fields) {
    definition.writeUInt8(field.fieldNumber, definitionOffset);
    definition.writeUInt8(field.size, definitionOffset + 1);
    definition.writeUInt8(field.baseType, definitionOffset + 2);
    definitionOffset += 3;
  }

  const data = Buffer.alloc(
    1 + fields.reduce((total, field) => total + field.size, 0),
  );
  let dataOffset = 0;
  data.writeUInt8(localMessageType, dataOffset);
  dataOffset += 1;

  for (const field of fields) {
    field.write(data, dataOffset);
    dataOffset += field.size;
  }

  return [definition, data];
}

function fitTimestamp(dateTime: string): number {
  return Math.round((Date.parse(dateTime) - Date.UTC(1989, 11, 31)) / 1000);
}

function zipFile(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const compressed = deflateRawSync(entry.content);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}
