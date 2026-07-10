import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { parseIngestArgs, runIngestCli } from "../src/cli/ingest";
import { parseLocalExports } from "../src/exports/export-scanner";
import { ingestInbox, formatIngestReport } from "../src/ingest/inbox";

describe("inbox ingest workflow", () => {
  it("ingests Garmin activity FIT, wellness ZIP, and sleep CSV for the same date", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/inbox/fake-run.fit"),
      syntheticFitActivity({
        sport: 1,
        dateTime: "2026-07-07T12:00:00Z",
        distanceMiles: 3,
        movingSeconds: 2400,
        avgHr: 145,
        maxHr: 165,
        avgCadence: 154,
      }),
    );
    writeFile(
      join(dir, "input/inbox/fake-wellness.zip"),
      zipFile([
        {
          name: "wellness.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-07T16:00:00Z",
            steps: 12345,
            sleepDurationMinutes: 300,
            sleepScore: 50,
            restingHeartRate: 55,
          }),
        },
      ]),
    );
    writeFile(join(dir, "input/inbox/fake-sleep.csv"), sleepCsv("2026-07-07"));

    const result = ingestInbox({
      cwd: dir,
      date: "2026-07-07",
      debug: true,
    });
    const journal = readFileSync(
      join(dir, "input/journal/2026-07-07.md"),
      "utf8",
    );
    const report = formatIngestReport(result);

    assert.equal(result.filesScanned, 3);
    assert.equal(result.activitiesParsed, 1);
    assert.equal(result.garminActivityFilesParsed, 1);
    assert.equal(result.wellnessZipFilesParsed, 1);
    assert.equal(result.sleepCsvRecordsParsed, 1);
    assert.equal(result.journalCreated, true);
    assert.match(journal, /Run - 3 mi - 40:00/);
    assert.match(journal, /Sleep Duration: 6h 40m/);
    assert.match(journal, /Sleep Score: 75/);
    assert.match(journal, /Resting Heart Rate: 58 bpm/);
    assert.match(journal, /Total Steps: 12,345/);
    assert.doesNotMatch(
      report,
      /fake-run|fake-wellness|fake-sleep|position_lat|position_long/i,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("ingests only wellness ZIP and sleep CSV on a no-activity day", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/inbox/wellness.zip"),
      zipFile([
        {
          name: "wellness.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-08T16:00:00Z",
            steps: 4200,
            restingHeartRate: 57,
          }),
        },
      ]),
    );
    writeFile(join(dir, "input/inbox/sleep.csv"), sleepCsv("2026-07-08"));

    const result = ingestInbox({ cwd: dir, date: "2026-07-08" });
    const journal = readFileSync(
      join(dir, "input/journal/2026-07-08.md"),
      "utf8",
    );

    assert.equal(result.activitiesParsed, 0);
    assert.equal(result.journalCreated, true);
    assert.match(journal, /No imported activities found/);
    assert.match(journal, /Total Steps: 4,200/);
    assert.match(journal, /Sleep Duration: 6h 40m/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a journal with imported references when the inbox has only activity FIT", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/inbox/activity.fit"),
      syntheticFitActivity({
        sport: 1,
        dateTime: "2026-07-07T12:00:00Z",
        distanceMiles: 2.5,
        movingSeconds: 2000,
        avgHr: 140,
        maxHr: 160,
        avgCadence: 152,
      }),
    );

    const result = ingestInbox({ cwd: dir, date: "2026-07-07" });
    const journal = readFileSync(
      join(dir, "input/journal/2026-07-07.md"),
      "utf8",
    );

    assert.equal(result.activitiesParsed, 1);
    assert.equal(result.fieldsPopulated.length, 0);
    assert.equal(result.journalCreated, true);
    assert.match(journal, /Run - 2.5 mi - 33:20/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("ingests a Strava JSON fallback from the shared inbox", () => {
    const dir = makeProject();
    writeJson(join(dir, "input/inbox/strava.json"), {
      activities: [
        {
          date: "2026-07-07T12:00:00Z",
          activityType: "walk",
          durationMinutes: 30,
          distanceMiles: 1.75,
        },
      ],
    });

    const result = ingestInbox({ cwd: dir, date: "2026-07-07" });
    const exports = parseLocalExports(dir, { timezone: "America/New_York" });

    assert.equal(result.activitiesParsed, 1);
    assert.equal(result.stravaFilesParsed, 1);
    assert.equal(result.garminActivityFilesParsed, 0);
    assert.equal(exports.activities[0]?.source, "strava_export");
    rmSync(dir, { recursive: true, force: true });
  });

  it("warns when Garmin and Strava exports likely duplicate the same activity", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/inbox/activity.fit"),
      syntheticFitActivity({
        sport: 1,
        dateTime: "2026-07-07T12:00:00Z",
        distanceMiles: 3,
        movingSeconds: 2400,
        avgHr: 145,
        maxHr: 165,
        avgCadence: 154,
      }),
    );
    writeJson(join(dir, "input/inbox/strava.json"), {
      activities: [
        {
          date: "2026-07-07T12:00:30Z",
          activityType: "run",
          durationMinutes: 40,
          distanceMiles: 3.01,
        },
      ],
    });

    const result = ingestInbox({ cwd: dir, date: "2026-07-07" });

    assert.equal(result.activitiesParsed, 2);
    assert.equal(result.duplicateWarnings.length, 1);
    assert.match(result.duplicateWarnings[0], /excluded one likely duplicate/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("preserves manual journal values while filling blank wellness fields", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/journal/2026-07-07.md"),
      [
        "# Daily Journal",
        "",
        "Date: 2026-07-07",
        "",
        "## Recovery",
        "",
        "Sleep Duration: 7h 0m",
        "Total Steps: 8k",
        "Resting Heart Rate:",
        "",
      ].join("\n"),
    );
    writeFile(
      join(dir, "input/inbox/wellness.zip"),
      zipFile([
        {
          name: "wellness.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-07T16:00:00Z",
            steps: 12000,
            restingHeartRate: 58,
          }),
        },
      ]),
    );

    const result = ingestInbox({ cwd: dir, date: "2026-07-07" });
    const journal = readFileSync(
      join(dir, "input/journal/2026-07-07.md"),
      "utf8",
    );

    assert.match(journal, /Sleep Duration: 7h 0m/);
    assert.match(journal, /Total Steps: 8k/);
    assert.match(journal, /Resting Heart Rate: 58 bpm/);
    assert.equal(result.fieldsPreserved.includes("Total Steps"), true);
    assert.equal(result.fieldsPopulated.includes("Resting Heart Rate"), true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses Garmin sleep CSV ahead of overlapping wellness ZIP sleep values", () => {
    const dir = makeProject();
    writeFile(
      join(dir, "input/inbox/wellness.zip"),
      zipFile([
        {
          name: "wellness.fit",
          content: syntheticWellnessFit({
            dateTime: "2026-07-07T16:00:00Z",
            steps: 9000,
            sleepDurationMinutes: 300,
            sleepScore: 50,
            restingHeartRate: 55,
          }),
        },
      ]),
    );
    writeFile(join(dir, "input/inbox/sleep.csv"), sleepCsv("2026-07-07"));

    ingestInbox({ cwd: dir, date: "2026-07-07" });
    const journal = readFileSync(
      join(dir, "input/journal/2026-07-07.md"),
      "utf8",
    );

    assert.match(journal, /Sleep Duration: 6h 40m/);
    assert.match(journal, /Sleep Score: 75/);
    assert.match(journal, /Resting Heart Rate: 58 bpm/);
    assert.match(journal, /Total Steps: 9,000/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("is idempotent across repeated ingest runs", () => {
    const dir = makeProject();
    writeFile(join(dir, "input/inbox/sleep.csv"), sleepCsv("2026-07-07"));

    ingestInbox({ cwd: dir, date: "2026-07-07" });
    const first = readFileSync(
      join(dir, "input/journal/2026-07-07.md"),
      "utf8",
    );
    const secondResult = ingestInbox({ cwd: dir, date: "2026-07-07" });
    const second = readFileSync(
      join(dir, "input/journal/2026-07-07.md"),
      "utf8",
    );

    assert.equal(second, first);
    assert.equal(secondResult.journalUpdated, false);
    assert.equal(lineMatchCount(second, /^Sleep Duration:/), 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("archives processed supported files after successful ingest", () => {
    const dir = makeProject();
    writeJson(join(dir, "input/inbox/strava.json"), {
      activities: [
        {
          date: "2026-07-07T12:00:00Z",
          activityType: "walk",
          durationMinutes: 30,
          distanceMiles: 1.75,
        },
      ],
    });

    const result = ingestInbox({
      cwd: dir,
      date: "2026-07-07",
      archive: true,
    });

    assert.equal(result.archivedFiles, 1);
    assert.equal(existsSync(join(dir, "input/inbox/strava.json")), false);
    assert.equal(
      existsSync(join(dir, "input/processed/2026-07-07/strava.json")),
      true,
    );
    assert.equal(
      parseLocalExports(dir, { timezone: "America/New_York" }).activities[0]
        ?.source,
      "strava_export",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not archive failed or unsupported inbox files", () => {
    const dir = makeProject();
    writeFile(join(dir, "input/inbox/broken.fit"), "not a fit file");

    const result = ingestInbox({
      cwd: dir,
      date: "2026-07-07",
      archive: true,
    });

    assert.equal(result.archivedFiles, 0);
    assert.equal(result.archiveSkipped, true);
    assert.equal(existsSync(join(dir, "input/inbox/broken.fit")), true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("supports CLI args and optional one-command coach generation", () => {
    const dir = makeProject();
    writeJson(join(dir, "input/inbox/strava.json"), {
      activities: [
        {
          date: "2026-07-07T12:00:00Z",
          activityType: "walk",
          durationMinutes: 30,
          distanceMiles: 1.75,
        },
      ],
    });

    assert.deepEqual(parseIngestArgs(["--date", "2026-07-07", "--coach"]), {
      date: "2026-07-07",
      debug: false,
      archive: false,
      coach: true,
    });
    const report = runIngestCli(dir, {
      date: "2026-07-07",
      debug: false,
      archive: false,
      coach: true,
    });

    assert.match(report, /Garmin\/Strava ingest/);
    assert.match(report, /Daily coach workflow/);
    assert.equal(existsSync(join(dir, "output/daily-checkin.md")), true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps reports privacy-safe", () => {
    const dir = makeProject();
    writeFile(join(dir, "input/inbox/private-file-name.txt"), "private");

    const report = formatIngestReport(
      ingestInbox({ cwd: dir, date: "2026-07-07", debug: true }),
    );

    assert.doesNotMatch(
      report,
      /private-file-name|raw FIT|position_lat|position_long|lat=|lon=/i,
    );
    rmSync(dir, { recursive: true, force: true });
  });
});

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "marathon-ingest-test-"));

  writeJson(join(dir, "private/athlete.config.local.json"), {
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
      runningBackground: "Fake ingest test background.",
    },
  });
  mkdirSync(join(dir, "input/inbox"), { recursive: true });
  mkdirSync(join(dir, "input/processed"), { recursive: true });
  mkdirSync(join(dir, "input/garmin"), { recursive: true });
  mkdirSync(join(dir, "input/strava"), { recursive: true });
  mkdirSync(join(dir, "output"), { recursive: true });

  return dir;
}

function writeFile(path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function writeJson(path: string, value: unknown): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sleepCsv(date: string): string {
  return [
    "Sleep Score 1 Day,Demo",
    `Date,${date}`,
    "Sleep Duration,6h 40m",
    "Sleep Score,75",
    "Quality,Good",
    "",
    "Sleep Timeline Metrics,Demo section",
    "Resting Heart Rate,58 bpm",
    "Avg Overnight Heart Rate,64 bpm",
    "Avg Overnight HRV,49 ms",
  ].join("\n");
}

function lineMatchCount(value: string, pattern: RegExp): number {
  return value.split(/\r?\n/).filter((line) => pattern.test(line)).length;
}

function syntheticWellnessFit(input: {
  dateTime: string;
  steps?: number;
  sleepDurationMinutes?: number;
  sleepScore?: number;
  restingHeartRate?: number;
}): Buffer {
  return syntheticFitRecords([
    {
      globalMessageNumber: 65280,
      fields: [
        uint32Field(253, fitTimestamp(input.dateTime)),
        uint32Field(100, input.steps),
        uint16Field(101, input.sleepDurationMinutes),
        uint8Field(102, input.sleepScore),
        uint8Field(103, input.restingHeartRate),
      ],
    },
  ]);
}

function syntheticFitActivity(input: {
  sport: number;
  dateTime: string;
  distanceMiles: number;
  movingSeconds: number;
  avgHr: number;
  maxHr: number;
  avgCadence: number;
}): Buffer {
  return syntheticFitRecords([
    {
      globalMessageNumber: 18,
      fields: [
        uint32Field(2, fitTimestamp(input.dateTime)),
        uint8Field(5, input.sport),
        uint8Field(6, undefined),
        uint32Field(7, input.movingSeconds * 1000),
        uint32Field(8, input.movingSeconds * 1000),
        uint32Field(9, Math.round(input.distanceMiles * 1609.344 * 100)),
        uint16Field(11, undefined),
        uint16Field(
          14,
          Math.round(
            (input.distanceMiles * 1609.344 * 1000) / input.movingSeconds,
          ),
        ),
        uint16Field(15, undefined),
        uint8Field(16, input.avgHr),
        uint8Field(17, input.maxHr),
        uint8Field(18, input.avgCadence),
        uint8Field(19, undefined),
        uint8Field(20, undefined),
        uint16Field(21, undefined),
        uint16Field(22, undefined),
        uint8Field(24, undefined),
      ],
    },
  ]);
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
