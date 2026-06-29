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
import { parseLocalExports } from "../src/exports/export-scanner";
import { createDailySummary } from "../src/generator/daily-summary";
import { renderDailyCheckIn } from "../src/generator/daily-markdown";
import { generateDailyCheckIn } from "../src/cli/generate-daily";
import { renderWeeklySummary } from "../src/generator/weekly-markdown";
import { createWeeklySummary } from "../src/generator/weekly-summary";
import {
  createJournal,
  loadJournalInputs,
  parseJournal,
} from "../src/parsers/journal";
import type { AthleteConfig } from "../src/types";

const fixtureRoot = join(process.cwd(), "tests/fixtures/exports");
const journalTemplate = readFileSync(
  join(process.cwd(), "input/journal/template.md"),
  "utf8",
);

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
    runningBackground: "Fake journal workflow background.",
  },
};

describe("daily journal workflow", () => {
  it("journal template includes a clear Total Steps field", () => {
    assert.match(journalTemplate, /## Recovery[\s\S]*Total Steps:/);
  });

  it("creates a dated journal with imported activity references", () => {
    const dir = makeJournalProject();
    const exports = parseLocalExports(dir);
    const result = createJournal({
      cwd: dir,
      date: "2026-06-27",
      importedActivities: exports.activities,
    });
    const content = readFileSync(
      join(dir, "input/journal/2026-06-27.md"),
      "utf8",
    );

    assert.equal(result.created, true);
    assert.equal(result.importedActivityCount, 2);
    assert.match(content, /Date: 2026-06-27/);
    assert.match(content, /Run - 4 mi - 40:00/);
    assert.match(content, /Walk - 2 mi - 40:00/);
    assert.match(content, /Do not manually re-enter/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not overwrite an existing journal", () => {
    const dir = makeJournalProject();
    const path = join(dir, "input/journal/2026-06-27.md");
    writeFile(path, "Existing fake journal");

    const result = createJournal({
      cwd: dir,
      date: "2026-06-27",
      importedActivities: parseLocalExports(dir).activities,
    });

    assert.equal(result.created, false);
    assert.equal(readFileSync(path, "utf8"), "Existing fake journal");
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the imported section when no exports exist for the date", () => {
    const dir = makeJournalProject();
    createJournal({
      cwd: dir,
      date: "2026-06-25",
      importedActivities: parseLocalExports(dir).activities,
    });
    const content = readFileSync(
      join(dir, "input/journal/2026-06-25.md"),
      "utf8",
    );

    assert.match(content, /No imported activities found for this date yet/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses recovery, nutrition, gear, notes, questions, and activities", () => {
    const parsed = parseJournal(fakeJournalMarkdown(), "2026-06-27");

    assert.equal(parsed.dailyNote.date, "2026-06-27");
    assert.equal(parsed.dailyNote.legSoreness, 3);
    assert.equal(parsed.dailyNote.gaitChanged, false);
    assert.equal(parsed.journalEntry.hydration, "Fake hydration note.");
    assert.equal(parsed.journalEntry.shoes, "Demo shoes.");
    assert.match(parsed.journalEntry.coachNotes ?? "", /fresh/);
    assert.match(parsed.journalEntry.questionsForCoach ?? "", /easy run/);
    assert.deepEqual(
      parsed.manualActivities.map((activity) => activity.activityType),
      ["rock_climbing", "mobility"],
    );
    assert.equal(parsed.manualActivities[0].source, "journal");
    assert.equal(parsed.manualActivities[0].durationMinutes, 60);
  });

  it("parses manual step field aliases and common compact values", () => {
    const cases = [
      ["Total Steps", "11000", "11000", 11000],
      ["Total Steps", "11,000", "11,000", 11000],
      ["Total Steps", "11k", "11k", 11000],
      ["Steps", "about 11k", "about 11k", 11000],
      ["Daily Steps", "~11.2k", "~11.2k", 11200],
      ["Step Count", "around 11,000", "around 11,000", 11000],
    ] as const;

    for (const [label, value, display, approx] of cases) {
      const parsed = parseJournal(stepJournal(label, value), "2026-06-27");

      assert.equal(parsed.dailyNote.totalSteps, display);
      assert.equal(parsed.dailyNote.stepsDisplay, display);
      assert.equal(parsed.dailyNote.stepsApprox, approx);
      assert.equal(parsed.dailyNote.stepsSource, "journal_manual");
    }
  });

  it("treats blank and placeholder step fields as missing", () => {
    for (const value of ["", "unknown", "not provided", "todo", "fill in"]) {
      const parsed = parseJournal(
        stepJournal("Total Steps", value),
        "2026-06-27",
      );

      assert.equal(parsed.dailyNote.totalSteps, null);
      assert.equal(parsed.dailyNote.stepsDisplay, null);
      assert.equal(parsed.dailyNote.stepsApprox, null);
      assert.equal(parsed.dailyNote.stepsSource, null);
    }
  });

  it("parses natural-language recovery values from journals", () => {
    const parsed = parseJournal(naturalLanguageRecoveryJournal(), "2026-06-27");

    assert.equal(parsed.dailyNote.legSoreness, "1-2");
    assert.equal(parsed.dailyNote.pain, 0);
    assert.equal(parsed.dailyNote.painLocation, "na");
    assert.equal(parsed.dailyNote.painType, "na");
    assert.equal(parsed.dailyNote.gaitChanged, false);
    assert.equal(parsed.dailyNote.fatigue, "no fatigue problems");
    assert.equal(parsed.dailyNote.energy, "average");
    assert.equal(parsed.dailyNote.sleepQuality, "average");
    assert.equal(parsed.dailyNote.stress, "average");
  });

  it("treats placeholder recovery values as missing", () => {
    const parsed = parseJournal(placeholderRecoveryJournal(), "2026-06-27");

    assert.equal(parsed.dailyNote.legSoreness, null);
    assert.equal(parsed.dailyNote.pain, null);
    assert.equal(parsed.dailyNote.gaitChanged, null);
    assert.equal(parsed.dailyNote.fatigue, null);
    assert.equal(parsed.dailyNote.energy, null);
    assert.equal(parsed.dailyNote.sleepQuality, null);
    assert.equal(parsed.dailyNote.stress, null);
  });

  it("ignores missing optional fields and sections gracefully", () => {
    const parsed = parseJournal("# Daily Journal\n\nDate: 2026-06-27\n");

    assert.equal(parsed.dailyNote.pain, null);
    assert.equal(parsed.journalEntry.fueling, null);
    assert.equal(parsed.manualActivities.length, 0);
  });

  it("renders blank journal nutrition and gear fields as not provided", () => {
    const parsed = parseJournal(blankJournalMarkdown(), "2026-06-27");
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-28",
        athleteConfig: fakeConfig,
        dailyNotes: [parsed.dailyNote],
        activityNotes: [],
        manualActivities: [],
        planNotes: null,
        journalEntries: [parsed.journalEntry],
      }),
    );

    assert.match(markdown, /Journal nutrition: not provided/);
    assert.match(markdown, /Journal gear: not provided/);
    assert.doesNotMatch(markdown, /Hydration: Fueling:/);
    assert.doesNotMatch(markdown, /Shoes: Equipment:/);
  });

  it("renders natural-language recovery values in daily Markdown", () => {
    const parsed = parseJournal(naturalLanguageRecoveryJournal(), "2026-06-27");
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-28",
        athleteConfig: fakeConfig,
        dailyNotes: [parsed.dailyNote],
        activityNotes: [],
        manualActivities: [],
        planNotes: null,
        journalEntries: [parsed.journalEntry],
      }),
    );

    assert.match(markdown, /Soreness: 1-2/);
    assert.match(markdown, /Pain: 0/);
    assert.match(markdown, /Pain location\/type: na \/ na/);
    assert.match(markdown, /Gait changed: No/);
    assert.match(markdown, /Fatigue: no fatigue problems/);
    assert.match(markdown, /Energy: average/);
    assert.match(markdown, /Sleep: average/);
    assert.match(markdown, /Stress: average/);
  });

  it("counts manual steps as provided and renders them without walking mileage", () => {
    const parsed = parseJournal(
      stepJournal("Steps", "about 11k"),
      "2026-06-27",
    );
    const summary = createDailySummary({
      date: "2026-06-28",
      athleteConfig: fakeConfig,
      dailyNotes: [parsed.dailyNote],
      activityNotes: [],
      manualActivities: [],
      planNotes: null,
      journalEntries: [parsed.journalEntry],
    });
    const markdown = renderDailyCheckIn(summary);

    assert.doesNotMatch(
      summary.checkInCompleteness.missingHighValueFields.join(","),
      /steps/,
    );
    assert.match(markdown, /Steps: about 11k/);
    assert.match(markdown, /Walking mileage: 0 mi/);
    assert.match(markdown, /1 high-step day/);
  });

  it("keeps placeholder manual steps missing for completeness", () => {
    const parsed = parseJournal(
      stepJournal("Total Steps", "placeholder"),
      "2026-06-27",
    );
    const summary = createDailySummary({
      date: "2026-06-28",
      athleteConfig: fakeConfig,
      dailyNotes: [parsed.dailyNote],
      activityNotes: [],
      manualActivities: [],
      planNotes: null,
      journalEntries: [parsed.journalEntry],
    });

    assert.match(
      summary.checkInCompleteness.missingHighValueFields.join(","),
      /steps/,
    );
  });

  it("warns when a journal activity may duplicate an imported activity", () => {
    const dir = makeJournalProject();
    writeFile(join(dir, "input/journal/2026-06-27.md"), duplicateRunJournal());
    const journal = loadJournalInputs(dir);
    const exports = parseLocalExports(dir);
    const summary = createDailySummary({
      date: "2026-06-28",
      athleteConfig: fakeConfig,
      dailyNotes: journal.dailyNotes,
      activityNotes: [],
      manualActivities: [...exports.activities, ...journal.manualActivities],
      planNotes: "Fake plan note.",
      journalEntries: journal.journalEntries,
      exportWarnings: exports.warnings,
    });

    assert.equal(summary.duplicateWarnings.length, 1);
    assert.equal(summary.duplicateWarnings[0].excludedFromTotals, false);
    assert.match(summary.duplicateWarnings[0].message, /partial similarity/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("merges journal context and imported activities into daily Markdown", () => {
    const dir = makeJournalProject();
    writeFile(join(dir, "input/journal/2026-06-27.md"), fakeJournalMarkdown());
    const journal = loadJournalInputs(dir);
    const exports = parseLocalExports(dir);
    const markdown = renderDailyCheckIn(
      createDailySummary({
        date: "2026-06-28",
        athleteConfig: fakeConfig,
        dailyNotes: journal.dailyNotes,
        activityNotes: [],
        manualActivities: [...exports.activities, ...journal.manualActivities],
        planNotes: "Fake plan note.",
        journalEntries: journal.journalEntries,
        exportWarnings: exports.warnings,
      }),
    );

    assert.match(markdown, /Running mileage: 4 mi/);
    assert.match(markdown, /Walking mileage: 2 mi/);
    assert.match(markdown, /Rock climbing:/);
    assert.match(markdown, /Journal nutrition: Hydration: Fake hydration note/);
    assert.match(
      markdown,
      /Questions from journal: Should tomorrow be easy run/,
    );
    assert.doesNotMatch(markdown, /10\.0000|20\.0000|trkpt|lat=|lon=/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("includes journal manual activities in weekly summaries", () => {
    const dir = makeJournalProject();
    writeFile(join(dir, "input/journal/2026-06-27.md"), fakeJournalMarkdown());
    const journal = loadJournalInputs(dir);
    const exports = parseLocalExports(dir);
    const summary = createWeeklySummary({
      weekStart: "2026-06-29",
      athleteConfig: fakeConfig,
      dailyNotes: journal.dailyNotes,
      activityNotes: [],
      manualActivities: [...exports.activities, ...journal.manualActivities],
      planNotes: "Fake plan note.",
      journalEntries: journal.journalEntries,
      exportWarnings: exports.warnings,
    });

    assert.equal(summary.totals.rockClimbingCount, 1);
    assert.equal(summary.totals.mobilityRestOtherCount, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("includes compact weekly step context from manual journal steps", () => {
    const parsed = parseJournal(
      stepJournal("Total Steps", "11k"),
      "2026-06-27",
    );
    const summary = createWeeklySummary({
      weekStart: "2026-06-29",
      athleteConfig: fakeConfig,
      dailyNotes: [parsed.dailyNote],
      activityNotes: [],
      manualActivities: [],
      planNotes: null,
      journalEntries: [parsed.journalEntry],
    });
    const markdown = renderWeeklySummary(summary);

    assert.equal(summary.totals.totalSteps, 11000);
    assert.equal(summary.totals.highStepDays, 1);
    assert.match(markdown, /High-step days: 1/);
    assert.match(markdown, /steps were provided for 1 of 7 evidence days/);
  });

  it("does not report noisy missing legacy files in journal workflow", () => {
    const dir = makeJournalProject();
    writeJson(join(dir, "private/athlete.config.local.json"), fakeConfig);
    writeFile(join(dir, "input/journal/2026-06-27.md"), fakeJournalMarkdown());

    const result = generateDailyCheckIn(dir, {
      date: "2026-06-28",
      preview: false,
      includeAthleteBackground: false,
    });

    assert.equal(result.missingFiles.length, 0);
    assert.doesNotMatch(result.markdown, /Missing local input file/);
    assert.match(result.markdown, /## Plan Notes\s+not provided/);
    rmSync(dir, { recursive: true, force: true });
  });
});

function fakeJournalMarkdown(): string {
  return [
    "# Daily Journal",
    "",
    "Date: 2026-06-27",
    "",
    "## Recovery",
    "",
    "Soreness (0-10): 3",
    "Pain (0-10): 1",
    "Pain Location: left calf",
    "Pain Type: tight",
    "Did pain change gait? (Yes/No): No",
    "Energy (0-10): 8",
    "Fatigue (0-10): 2",
    "Sleep: 7",
    "Stress (0-10): 4",
    "",
    "## Manual Activities",
    "",
    "### Rock climbing",
    "",
    "Duration: 60",
    "Intensity: moderate",
    "Notes: Fake climbing session.",
    "",
    "### Mobility",
    "",
    "Duration: 20 min",
    "Intensity: easy",
    "Notes: Fake mobility work.",
    "",
    "## Nutrition",
    "",
    "Hydration: Fake hydration note.",
    "Fueling: Fake fueling note.",
    "Body Weight (optional): 150 lb demo value",
    "",
    "## Gear Notes",
    "",
    "Shoes: Demo shoes.",
    "Equipment: Demo harness.",
    "Other Notes: No issues.",
    "",
    "## Coach Notes",
    "",
    "Legs felt surprisingly fresh.",
    "",
    "## Questions for Coach",
    "",
    "Should tomorrow be easy run or rest?",
    "",
  ].join("\n");
}

function naturalLanguageRecoveryJournal(): string {
  return [
    "# Daily Journal",
    "",
    "Date: 2026-06-27",
    "",
    "## Recovery",
    "",
    "Total Steps: 1234",
    "Soreness (0-10 or words): 1-2",
    "Pain (0-10 or words): 0",
    "Pain Location: na",
    "Pain Type: na",
    "Did pain change gait? (Yes/No): na",
    "Energy (0-10 or words): average",
    "Fatigue (0-10 or words): no fatigue problems",
    "Sleep: average",
    "Stress (0-10 or words): average",
    "",
    "## Gear Notes",
    "",
    "Shoes: none / no run",
    "",
    "## Coach Notes",
    "",
    "Tomorrow has fake schedule constraints.",
  ].join("\n");
}

function stepJournal(label: string, value: string): string {
  return [
    "# Daily Journal",
    "",
    "Date: 2026-06-27",
    "",
    "## Recovery",
    "",
    "Soreness (0-10 or words): 1",
    "Pain (0-10 or words): 0",
    "Did pain change gait? (Yes/No): No",
    "Energy (0-10 or words): 8",
    "Fatigue (0-10 or words): 2",
    "Sleep: 7",
    "Stress (0-10 or words): 3",
    `${label}: ${value}`,
    "",
    "## Coach Notes",
    "",
    "Fake schedule constraint.",
  ].join("\n");
}

function placeholderRecoveryJournal(): string {
  return [
    "# Daily Journal",
    "",
    "Date: 2026-06-27",
    "",
    "## Recovery",
    "",
    "Soreness (0-10 or words): unknown",
    "Pain (0-10 or words): not provided",
    "Did pain change gait? (Yes/No): todo",
    "Energy (0-10 or words): placeholder",
    "Fatigue (0-10 or words): fill in",
    "Sleep: TBD",
    "Stress (0-10 or words): unknown",
  ].join("\n");
}

function duplicateRunJournal(): string {
  return [
    "# Daily Journal",
    "",
    "Date: 2026-06-27",
    "",
    "## Manual Activities",
    "",
    "### Run",
    "",
    "Duration: 40:00",
    "Intensity: easy",
    "Notes: Fake duplicate copied from watch.",
    "",
  ].join("\n");
}

function blankJournalMarkdown(): string {
  return [
    "# Daily Journal",
    "",
    "Date: 2026-06-27",
    "",
    "## Nutrition",
    "",
    "Hydration:",
    "Fueling:",
    "Body Weight (optional):",
    "",
    "---",
    "",
    "## Gear Notes",
    "",
    "Shoes:",
    "Equipment:",
    "Other Notes:",
    "",
  ].join("\n");
}

function makeJournalProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "marathon-journal-test-"));
  writeFile(join(dir, "input/journal/template.md"), journalTemplate);
  copyFixture(
    "garmin/nested/sample-garmin.tcx",
    join(dir, "input/garmin/nested/sample-garmin.tcx"),
  );
  copyFixture(
    "strava/sample-strava.gpx",
    join(dir, "input/strava/sample-strava.gpx"),
  );

  return dir;
}

function copyFixture(sourceRelativePath: string, destination: string): void {
  writeFile(
    destination,
    readFileSync(join(fixtureRoot, sourceRelativePath), "utf8"),
  );
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function writeJson(path: string, value: unknown): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
