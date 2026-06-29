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
import {
  formatCheckInValidationReport,
  parseValidateCheckInArgs,
  validateCheckIn,
} from "../src/cli/validate-checkin";
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
    runningBackground: "Fake check-in validation background.",
  },
};

describe("check-in completeness validation", () => {
  it("validate:checkin command exists in package scripts", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    assert.equal(Boolean(packageJson.scripts["validate:checkin"]), true);
  });

  it("warns about missing high-value subjective fields", () => {
    const dir = makeProject();
    writeJournal(dir, "2026-06-27", minimalJournal());

    const result = validateCheckIn(dir, {
      evidenceDate: "2026-06-27",
    });
    const report = formatCheckInValidationReport(result);

    assert.equal(result.completeness.status, "needs_subjective_details");
    assert.deepEqual(result.completeness.missingHighValueFields, [
      "soreness",
      "pain",
      "gait changed",
      "energy",
      "steps",
      "sleep",
      "tomorrow constraints / coach notes",
    ]);
    assert.match(report, /Status: needs subjective details/);
    assert.match(report, /\* soreness/);
    assert.doesNotMatch(report, /lat=|lon=|trkpt|position_lat|position_long/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("counts explicit zero and no values as provided", () => {
    const dir = makeProject();
    writeJournal(dir, "2026-06-27", completeRestJournal());

    const result = validateCheckIn(dir, {
      evidenceDate: "2026-06-27",
    });

    assert.equal(result.completeness.status, "complete");
    assert.deepEqual(result.completeness.missingHighValueFields, []);
    rmSync(dir, { recursive: true, force: true });
  });

  it("treats blank placeholder values as missing", () => {
    const dir = makeProject();
    writeJournal(dir, "2026-06-27", placeholderJournal());

    const result = validateCheckIn(dir, {
      evidenceDate: "2026-06-27",
    });

    assert.match(
      result.completeness.missingHighValueFields.join(", "),
      /tomorrow constraints/,
    );
    assert.match(result.completeness.optionalReminders.join(" "), /fueling/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses stronger high-value warnings on run days", () => {
    const dir = makeProject();
    writeJournal(dir, "2026-06-27", minimalJournal());
    writeManualActivities(dir, "run");

    const result = validateCheckIn(dir, {
      evidenceDate: "2026-06-27",
    });

    assert.equal(result.completeness.activityContext, "run");
    assert.match(
      result.completeness.missingHighValueFields.join(", "),
      /fatigue/,
    );
    assert.match(
      result.completeness.missingHighValueFields.join(", "),
      /shoes/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps non-run day warnings softer", () => {
    const dir = makeProject();
    writeJournal(dir, "2026-06-27", minimalJournal());
    writeManualActivities(dir, "walk");

    const result = validateCheckIn(dir, {
      evidenceDate: "2026-06-27",
    });

    assert.equal(result.completeness.activityContext, "non_run_activity");
    assert.doesNotMatch(
      result.completeness.missingHighValueFields.join(", "),
      /fatigue|shoes/,
    );
    assert.match(result.completeness.optionalReminders.join(" "), /gear/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("includes the manual-only activity reminder without blocking", () => {
    const dir = makeProject();
    writeJournal(dir, "2026-06-27", completeRestJournal());

    const result = validateCheckIn(dir, {
      evidenceDate: "2026-06-27",
    });

    assert.match(
      result.completeness.manualOnlyActivityReminder ?? "",
      /Manual-only activities are not detected/,
    );
    assert.equal(result.completeness.status, "complete");
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws for invalid evidence dates", () => {
    const dir = makeProject();

    assert.throws(
      () =>
        validateCheckIn(dir, {
          evidenceDate: "2026-02-31",
        }),
      /Invalid calendar date/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses validate:checkin arguments", () => {
    assert.deepEqual(
      parseValidateCheckInArgs(["--evidence-date", "2026-06-27"]),
      { evidenceDate: "2026-06-27" },
    );
  });
});

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "marathon-checkin-test-"));

  writeJson(join(dir, "private/athlete.config.local.json"), fakeConfig);
  mkdirSync(join(dir, "input/manual"), { recursive: true });
  mkdirSync(join(dir, "input/garmin"), { recursive: true });
  mkdirSync(join(dir, "input/strava"), { recursive: true });

  return dir;
}

function writeJournal(dir: string, date: string, content: string): void {
  writeFile(join(dir, `input/journal/${date}.md`), content);
}

function writeManualActivities(dir: string, activityType: string): void {
  writeFile(
    join(dir, "input/manual/manual-activities.csv"),
    [
      "date,source,activity_type,distance_miles,duration_minutes,pace_min_per_mile,elevation_ft,avg_hr,max_hr,steps,notes",
      `2026-06-27,manual,${activityType},3,45,,,,,,Fake ${activityType}`,
    ].join("\n"),
  );
}

function minimalJournal(): string {
  return ["# Daily Journal", "", "Date: 2026-06-27"].join("\n");
}

function completeRestJournal(): string {
  return [
    "# Daily Journal",
    "",
    "Date: 2026-06-27",
    "",
    "## Recovery",
    "",
    "Total Steps: 0",
    "Soreness (0-10): 0",
    "Pain (0-10): 0",
    "Did pain change gait? (Yes/No): No",
    "Energy (0-10): 0",
    "Sleep: 0",
    "",
    "## Gear Notes",
    "",
    "Shoes: none / no run",
    "",
    "## Coach Notes",
    "",
    "Tomorrow is a fake rest day with no constraints.",
  ].join("\n");
}

function placeholderJournal(): string {
  return [
    "# Daily Journal",
    "",
    "Date: 2026-06-27",
    "",
    "## Recovery",
    "",
    "Total Steps: unknown",
    "Soreness (0-10): n/a",
    "Pain (0-10): not provided",
    "Did pain change gait? (Yes/No):",
    "Energy (0-10):",
    "Sleep:",
    "",
    "## Nutrition",
    "",
    "Hydration: n/a",
    "Fueling: unknown",
    "",
    "## Coach Notes",
    "",
    "not provided",
  ].join("\n");
}

function writeJson(path: string, value: unknown): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
