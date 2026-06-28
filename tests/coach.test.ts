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
import type { AthleteConfig } from "../src/types";

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
    assert.match(consoleOutput, /Evidence date: 2026-06-27/);
    assert.match(consoleOutput, /Coaching date: 2026-06-28/);
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

function writeFile(path: string, content: string): void {
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
