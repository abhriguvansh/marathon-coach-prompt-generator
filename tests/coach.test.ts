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
import {
  parseCoachArgs,
  resolveCoachDates,
  runCoachWorkflow,
} from "../src/cli/coach";
import { parseLocalExports } from "../src/exports/export-scanner";
import type { AthleteConfig } from "../src/types";

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
    runningBackground: "Fake coach workflow background.",
  },
};

describe("coach workflow CLI", () => {
  it("coach:tonight calculates evidence today and coaching tomorrow", () => {
    assert.deepEqual(
      resolveCoachDates(
        parseCoachArgs(["--mode", "tonight"]),
        localNoon("2026-06-27"),
      ),
      {
        evidenceDate: "2026-06-27",
        coachingDate: "2026-06-28",
      },
    );
  });

  it("coach:morning calculates evidence yesterday and coaching today", () => {
    assert.deepEqual(
      resolveCoachDates(
        parseCoachArgs(["--mode", "morning"]),
        localNoon("2026-06-28"),
      ),
      {
        evidenceDate: "2026-06-27",
        coachingDate: "2026-06-28",
      },
    );
  });

  it("calculates coaching date from explicit evidence date across year boundary", () => {
    assert.deepEqual(
      resolveCoachDates(parseCoachArgs(["--evidence-date", "2026-12-31"])),
      {
        evidenceDate: "2026-12-31",
        coachingDate: "2027-01-01",
      },
    );
  });

  it("calculates evidence date from explicit coaching date", () => {
    assert.deepEqual(
      resolveCoachDates(parseCoachArgs(["--coaching-date", "2026-06-28"])),
      {
        evidenceDate: "2026-06-27",
        coachingDate: "2026-06-28",
      },
    );
  });

  it("validates explicit evidence and coaching dates are one day apart", () => {
    assert.throws(
      () =>
        resolveCoachDates(
          parseCoachArgs([
            "--evidence-date",
            "2026-06-27",
            "--coaching-date",
            "2026-06-29",
          ]),
        ),
      /exactly one day apart/,
    );
  });

  it("creates a missing evidence journal and generates daily check-in", () => {
    const dir = makeCoachProject();
    const logs: string[] = [];
    const result = runCoachWorkflow({
      cwd: dir,
      args: parseCoachArgs(["--evidence-date", "2026-06-27"]),
      log: (message) => logs.push(message),
    });
    const journalPath = join(dir, "input/journal/2026-06-27.md");
    const output = readFileSync(join(dir, "output/daily-checkin.md"), "utf8");
    const consoleOutput = logs.join("\n");

    assert.equal(result.evidenceDate, "2026-06-27");
    assert.equal(result.coachingDate, "2026-06-28");
    assert.equal(result.journalCreated, true);
    assert.equal(existsSync(journalPath), true);
    assert.match(output, /- Date: 2026-06-28/);
    assert.match(output, /- Evidence date: 2026-06-27/);
    assert.doesNotMatch(output, /## Athlete Background/);
    assert.match(consoleOutput, /Evidence date: 2026-06-27/);
    assert.match(consoleOutput, /Coaching date: 2026-06-28/);
    assert.match(consoleOutput, /Daily check-in mode: compact/);
    assert.match(
      consoleOutput,
      /Check-in completeness for evidence date 2026-06-27/,
    );
    assert.match(consoleOutput, /Status: needs subjective details/);
    assert.match(
      consoleOutput,
      /Create or reuse input\/journal\/2026-06-27\.md/,
    );
    assert.doesNotMatch(
      consoleOutput,
      /lat=|lon=|trkpt|position_lat|position_long/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("reuses an existing evidence journal without overwriting it", () => {
    const dir = makeCoachProject();
    const journalPath = join(dir, "input/journal/2026-06-27.md");
    const existing = "# Existing Fake Journal\n\nDate: 2026-06-27\n";
    const logs: string[] = [];
    writeFile(journalPath, existing);

    const result = runCoachWorkflow({
      cwd: dir,
      args: parseCoachArgs(["--coaching-date", "2026-06-28"]),
      log: (message) => logs.push(message),
    });

    assert.equal(result.journalCreated, false);
    assert.equal(readFileSync(journalPath, "utf8"), existing);
    assert.match(logs.join("\n"), /Journal reused/);
    assert.match(
      readFileSync(join(dir, "output/daily-checkin.md"), "utf8"),
      /Evidence date: 2026-06-27/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("can include athlete background through the coach workflow flag", () => {
    const dir = makeCoachProject();

    runCoachWorkflow({
      cwd: dir,
      args: parseCoachArgs([
        "--evidence-date",
        "2026-06-27",
        "--include-athlete-background",
      ]),
    });

    assert.match(
      readFileSync(join(dir, "output/daily-checkin.md"), "utf8"),
      /## Athlete Background/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses the same canonical Garmin activity and fresh journal object for coach workflows", () => {
    const dir = makeCoachProject();
    const journalPath = join(dir, "input/journal/2026-07-03.md");
    writeFile(join(dir, "input/garmin/synthetic-run.fit"), syntheticRunFit());
    writeFile(
      join(dir, "input/garmin/synthetic-run.csv"),
      garminCompanionCsv(),
    );
    writeFile(journalPath, canonicalRecoveryJournal());

    const parsed = parseLocalExports(dir, { timezone: "America/New_York" });
    const explicitLogs: string[] = [];
    const explicit = runCoachWorkflow({
      cwd: dir,
      args: parseCoachArgs(["--evidence-date", "2026-07-03", "--debug"]),
      log: (message) => explicitLogs.push(message),
    });
    const tonight = runCoachWorkflow({
      cwd: dir,
      args: parseCoachArgs(["--mode", "tonight"]),
      now: localNoon("2026-07-03"),
    });
    const output = readFileSync(join(dir, "output/daily-checkin.md"), "utf8");
    const currentCoachNote =
      "Run was difficult because of the heat. Legs felt fine, but overall body fatigue increased during the run. Pace faded and I stopped before 3.25 miles.";

    assert.deepEqual(explicit.canonicalActivities, parsed.activities);
    assert.deepEqual(tonight.canonicalActivities, parsed.activities);
    assert.match(output, /run, 2\.81 mi, 40:40 elapsed, 40:09 moving/);
    assert.match(output, /0:31 stopped\/paused/);
    assert.match(output, /Avg HR 161, Max HR 190/);
    assert.match(output, /Elevation gain 69 ft, loss 66 ft/);
    assert.match(output, /Cadence 136 spm, Max cadence 163 spm/);
    assert.match(output, /Avg power 197 W, Max power 318 W/);
    assert.match(output, /580 calories/);
    assert.match(output, /Aerobic training effect 4\.4/);
    assert.match(output, /Avg temp 96\.8 F/);
    assert.match(output, /Sleep: good/);
    assert.match(output, /Sleep duration: 7h 12m/);
    assert.match(output, /Sleep score: 75/);
    assert.match(output, /Resting heart rate: 58 bpm/);
    assert.match(output, /Average overnight heart rate: 64 bpm/);
    assert.match(output, /Overnight HRV: 49 ms/);
    assert.match(output, /Garmin stress: 11/);
    assert.match(output, /Body Battery: \+51/);
    assert.equal(countOccurrences(output, currentCoachNote), 1);
    assert.match(output, /Missing high-value subjective fields: shoes\./);
    const completenessLine =
      output
        .split("\n")
        .find((line) =>
          line.includes("Missing high-value subjective fields"),
        ) ?? "";
    assert.doesNotMatch(
      completenessLine,
      /soreness,|pain,|gait changed|energy|fatigue|sleep|tomorrow constraints/,
    );
    assert.doesNotMatch(
      output,
      /40:35 moving|0:05 stopped|1043 ft|68 spm|81 spm|197 C/,
    );
    assert.match(
      explicitLogs.join("\n"),
      /Debug journal read: evidence date 2026-07-03; journal input\/journal\/2026-07-03\.md; .*parsed recovery fields \d+; coach notes text yes/,
    );

    rmSync(dir, { recursive: true, force: true });
  });
});

function makeCoachProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "marathon-coach-workflow-test-"));

  writeJson(join(dir, "private/athlete.config.local.json"), fakeConfig);
  writeFile(join(dir, "input/journal/template.md"), journalTemplate());
  mkdirSync(join(dir, "input/garmin"), { recursive: true });
  mkdirSync(join(dir, "input/strava"), { recursive: true });

  return dir;
}

function localNoon(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

function writeJson(path: string, value: unknown): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function journalTemplate(): string {
  return [
    "# Daily Journal",
    "",
    "Date: {{DATE}}",
    "",
    "## Imported Activities (Reference Only)",
    "",
    "{{IMPORTED_ACTIVITIES}}",
    "",
    "## Recovery",
    "",
    "Total Steps:",
    "",
    "Soreness (0-10):",
    "",
    "Pain (0-10):",
    "",
    "## Manual Activities",
    "",
    "## Nutrition",
    "",
    "Hydration:",
    "",
    "## Gear Notes",
    "",
    "Shoes:",
    "",
    "## Coach Notes",
    "",
    "## Questions for Coach",
    "",
  ].join("\n");
}

function canonicalRecoveryJournal(): string {
  return [
    "# Daily Journal",
    "",
    "Date: 2026-07-03",
    "",
    "## Imported Activities (Reference Only)",
    "",
    "* Old imported reference",
    "",
    "## Recovery",
    "",
    "Soreness (0-10 or words): 1",
    "Pain (0-10 or words): 0",
    "Pain Location: na",
    "Pain Type: na",
    "Did pain change gait? (Yes/No): No",
    "Energy (0-10 or words): average before run, reduced during run",
    "Fatigue (0-10 or words): elevated during run, primarily from heat",
    "Sleep: good",
    "Sleep Duration: 7h 12m",
    "Sleep Score: 75",
    "Resting Heart Rate: 58 bpm",
    "Average Overnight Heart Rate: 64 bpm",
    "Overnight HRV: 49 ms",
    "HRV Status: unavailable / no established status",
    "Stress (0-10 or words): average",
    "Garmin Stress: 11",
    "Body Battery: +51",
    "Total Steps: 7,962",
    "",
    "## Coach Notes",
    "",
    "<!-- stale note should be ignored -->",
    "Run was difficult because of the heat. Legs felt fine, but overall body fatigue increased during the run. Pace faded and I stopped before 3.25 miles.",
    "",
  ].join("\n");
}

function garminCompanionCsv(): string {
  return [
    '"Laps","Time","Cumulative Time","Distance mi","Avg Pace min/mi","Avg GAP min/mi","Avg HR bpm","Max HR bpm","Total Ascent ft","Total Descent ft","Avg Power W","Avg W/kg","Max Power W","Max W/kg","Avg Run Cadence spm","Avg Ground Contact Time ms","Avg Stride Length m","Avg Vertical Oscillation cm","Avg Vertical Ratio %","Calories C","Avg Temperature","Best Pace min/mi","Max Run Cadence spm","Moving Time","Avg Moving Pace min/mi"',
    '"1","14:12","14:12","1.00","14:12","14:12","144","171","36","26","203","2.63","300","3.88","138","310","0.79","8.8","11.1","179","96.8","12:40","161","13:48","13:48"',
    '"2","13:19","27:31","1.00","13:19","13:19","171","190","20","16","219","2.84","320","4.15","143","305","0.82","8.6","10.8","206","96.8","12:30","163","13:19","13:19"',
    '"3","13:04","40:35","0.81","16:09","16:09","169","188","10","26","167","2.16","315","4.08","129","330","0.74","9.2","12.4","195","96.8","12:50","158","13:02","16:05"',
    '"Summary","40:35","40:35","2.81","14:27","14:17","161","190","69","66","197","2.55","318","4.13","136","318","0.76","9.1","12.0","580","96.8","10:41","163","40:09","14:18"',
  ].join("\n");
}

function countOccurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}

function syntheticRunFit(): Buffer {
  return syntheticFitFile([
    fitSummaryDefinition(0, 18),
    fitSummaryData(0, {
      sport: 1,
      dateTime: "2026-07-03T12:00:00Z",
      distanceMiles: 2.81,
      movingSeconds: 2435,
      elapsedSeconds: 2440,
      avgHr: 161,
      maxHr: 190,
      ascentMeters: 318,
      descentMeters: 20,
      avgCadence: 68,
      maxCadence: 81,
      calories: 580,
      trainingEffect: 4.4,
      temperatureC: 197,
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
    elapsedSeconds: number;
    avgHr: number;
    maxHr: number;
    ascentMeters: number;
    descentMeters: number;
    avgCadence: number;
    maxCadence: number;
    calories: number;
    trainingEffect: number;
    temperatureC: number;
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
  data.writeUInt32LE(input.elapsedSeconds * 1000, offset);
  offset += 4;
  data.writeUInt32LE(input.movingSeconds * 1000, offset);
  offset += 4;
  data.writeUInt32LE(Math.round(input.distanceMiles * 1609.344 * 100), offset);
  offset += 4;
  data.writeUInt16LE(input.calories, offset);
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
  data.writeUInt8(input.maxCadence, offset);
  offset += 1;
  data.writeUInt8(input.temperatureC, offset);
  offset += 1;
  data.writeUInt16LE(input.ascentMeters, offset);
  offset += 2;
  data.writeUInt16LE(input.descentMeters, offset);
  offset += 2;
  data.writeUInt8(Math.round(input.trainingEffect * 10), offset);

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
