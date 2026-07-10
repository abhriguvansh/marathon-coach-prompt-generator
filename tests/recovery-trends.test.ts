import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDailyRecoveryTrendFlags,
  buildWeeklyRecoveryTrendFlags,
} from "../src/generator/recovery-trends";
import type { DailyNote, ManualActivity, RecoveryValue } from "../src/types";

describe("recovery trend flags", () => {
  it("detects soreness improving, stable, worsening, fluctuating, and limited context", () => {
    assert.match(
      dailyFlags([
        note("2026-06-24", 4, 0, false),
        note("2026-06-25", 3, 0, false),
        note("2026-06-26", "1-2", 0, false),
      ]).join("\n"),
      /Soreness trend: improving/,
    );
    assert.match(
      dailyFlags([
        note("2026-06-25", 1, 0, false),
        note("2026-06-26", 1, 0, false),
      ]).join("\n"),
      /Soreness trend: stable and low/,
    );
    assert.match(
      dailyFlags([
        note("2026-06-25", 1, 0, false),
        note("2026-06-26", 3, 0, false),
      ]).join("\n"),
      /Soreness trend: caution - worsening/,
    );
    assert.match(
      dailyFlags([
        note("2026-06-24", 1, 0, false),
        note("2026-06-25", 4, 0, false),
        note("2026-06-26", 1, 0, false),
      ]).join("\n"),
      /Soreness trend: fluctuating/,
    );
    assert.match(
      dailyFlags([note("2026-06-26", 1, 0, false)]).join("\n"),
      /Soreness trend: limited context/,
    );
  });

  it("detects pain trend cases without treating missing pain as zero", () => {
    assert.match(
      dailyFlags([
        note("2026-06-25", 1, 0, false),
        note("2026-06-26", 1, 0, false),
      ]).join("\n"),
      /Pain trend: stable at 0/,
    );
    assert.match(
      dailyFlags([
        note("2026-06-25", 1, 0, false),
        note("2026-06-26", 1, 2, false),
      ]).join("\n"),
      /Pain trend: caution - pain reported after recent 0s/,
    );
    assert.match(
      dailyFlags([
        note("2026-06-25", 1, 1, false),
        note("2026-06-26", 1, "3/4", false),
      ]).join("\n"),
      /Pain trend: caution - pain appears to be increasing/,
    );
    assert.match(
      dailyFlags([
        note("2026-06-25", 1, 2, false),
        note("2026-06-26", 1, 2, false),
      ]).join("\n"),
      /Pain trend: stable but present/,
    );
    assert.match(
      dailyFlags([
        note("2026-06-25", 1, null, false),
        note("2026-06-26", 1, 0, false),
      ]).join("\n"),
      /Pain trend: limited context/,
    );
  });

  it("handles gait values conservatively", () => {
    assert.match(
      dailyFlags([
        note("2026-06-25", 1, 0, false),
        note("2026-06-26", 1, 0, true),
      ]).join("\n"),
      /Gait: caution - gait change reported recently/,
    );
    assert.match(
      dailyFlags([
        note("2026-06-25", 1, 0, false),
        note("2026-06-26", 1, 0, "no"),
      ]).join("\n"),
      /Gait: no changes reported/,
    );
    assert.doesNotMatch(
      dailyFlags([
        note("2026-06-25", 1, 0, "na"),
        note("2026-06-26", 1, 0, "normal"),
      ]).join("\n"),
      /gait change reported recently/,
    );
  });

  it("handles natural-language recovery values without crashing", () => {
    const flags = dailyFlags([
      note("2026-06-25", "barely present", "no pain", false, "Felt fine."),
      note("2026-06-26", "mild", "pain 0", false, "No fatigue problems."),
    ]);

    assert.match(flags.join("\n"), /Pain trend: stable at 0/);
    assert.match(flags.join("\n"), /Gait: no changes reported/);
  });

  it("connects high load and recovery trends cautiously", () => {
    const worsening = dailyFlags(
      [note("2026-06-25", 1, 0, false), note("2026-06-26", 4, 1, false)],
      [activity("2026-06-26", "run"), activity("2026-06-26", "rock_climbing")],
    ).join("\n");
    const stable = dailyFlags(
      [note("2026-06-25", 1, 0, false), note("2026-06-26", 1, 0, false)],
      [activity("2026-06-26", "run"), activity("2026-06-26", "rock_climbing")],
    ).join("\n");

    assert.match(worsening, /higher total load coincided with worse recovery/);
    assert.match(
      stable,
      /higher total load did not coincide with worsening pain\/gait/,
    );
  });

  it("treats 0 to 1 soreness with no pain or gait concern as mild and controlled", () => {
    const flags = dailyFlags([
      note("2026-06-25", 0, 0, false, "Fake easy day.", 0),
      note("2026-06-26", 1, 0, false, "Fake easy run felt comfortable.", 0),
    ]).join("\n");

    assert.match(flags, /Soreness trend: mild and controlled/);
    assert.doesNotMatch(flags, /caution - worsening/);
  });

  it("uses a mild load note for 0 to 1 soreness after a high-step day", () => {
    const flags = dailyFlags([
      note("2026-06-25", 0, 0, false, "Fake easy day.", 0),
      noteWithSteps(
        "2026-06-26",
        1,
        0,
        false,
        "Fake easy run felt comfortable.",
        0,
        "12,000",
      ),
    ]).join("\n");

    assert.match(flags, /higher step\/load may add recovery demand/);
    assert.doesNotMatch(flags, /avoid stacking load until stable/);
    assert.doesNotMatch(
      flags,
      /higher total load coincided with worse recovery/,
    );
  });

  it("keeps caution wording for soreness rising to 2 or more", () => {
    const flags = dailyFlags([
      note("2026-06-25", 0, 0, false, "Fake easy day.", 0),
      note("2026-06-26", 2, 0, false, "Fake soreness increased.", 0),
    ]).join("\n");

    assert.match(flags, /Soreness trend: caution - worsening/);
  });

  it("keeps caution wording when soreness increase combines with pain", () => {
    const flags = dailyFlags([
      note("2026-06-25", 0, 0, false, "Fake easy day.", 0),
      note("2026-06-26", 1, 1, false, "Fake soreness with pain.", 0),
    ]).join("\n");

    assert.match(flags, /Soreness trend: caution - worsening/);
    assert.match(flags, /Pain trend: caution/);
  });

  it("keeps caution wording when soreness increase combines with gait concern", () => {
    const flags = dailyFlags([
      note("2026-06-25", 0, 0, false, "Fake easy day.", 0),
      note("2026-06-26", 1, 0, true, "Fake gait changed.", 0),
    ]).join("\n");

    assert.match(flags, /Soreness trend: caution - worsening/);
    assert.match(flags, /Gait: caution/);
  });

  it("renders compact weekly flags", () => {
    const flags = buildWeeklyRecoveryTrendFlags({
      dailyNotes: [
        note("2026-06-22", 2, 0, false),
        note("2026-06-23", "1-2", 0, false),
        note("2026-06-24", 1, 0, false),
      ],
      manualActivities: [],
    });

    assert.match(flags.bullets.join("\n"), /Soreness: improved/);
    assert.match(flags.bullets.join("\n"), /Pain: remained 0/);
    assert.match(flags.bullets.join("\n"), /3\/7/);
  });
});

function dailyFlags(
  notes: DailyNote[],
  activities: ManualActivity[] = [],
): string[] {
  return buildDailyRecoveryTrendFlags({
    evidenceDate: "2026-06-26",
    dailyNotes: notes,
    manualActivities: activities,
  }).bullets;
}

function note(
  date: string,
  soreness: RecoveryValue,
  pain: RecoveryValue,
  gaitChanged: boolean | string | null,
  notes: string | null = null,
  fatigue: RecoveryValue = null,
): DailyNote {
  return {
    date,
    totalSteps: null,
    legSoreness: soreness,
    pain,
    painLocation: pain === null || pain === 0 ? null : "demo calf",
    painType: pain === null || pain === 0 ? null : "demo ache",
    gaitChanged,
    fatigue,
    energy: null,
    sleepQuality: null,
    stress: null,
    motivation: null,
    notes,
  };
}

function noteWithSteps(
  date: string,
  soreness: RecoveryValue,
  pain: RecoveryValue,
  gaitChanged: boolean | string | null,
  notes: string | null,
  fatigue: RecoveryValue,
  steps: string,
): DailyNote {
  return {
    ...note(date, soreness, pain, gaitChanged, notes, fatigue),
    totalSteps: steps,
    stepsDisplay: steps,
    stepsApprox: Number(steps.replace(/,/g, "")),
    stepsSource: "journal_manual",
  };
}

function activity(date: string, activityType: string): ManualActivity {
  return {
    date,
    source: "manual",
    activityType,
    distanceMiles: activityType === "run" ? 3 : null,
    durationMinutes: 30,
    paceMinPerMile: null,
    elevationFt: null,
    avgHr: null,
    maxHr: null,
    steps: null,
    notes: `Fake ${activityType}`,
  };
}
