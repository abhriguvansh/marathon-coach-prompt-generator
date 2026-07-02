import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysUntilRace,
  formatDate,
  getWeekRange,
  parseDate,
} from "../src/utils/dates";
import { formatUnknown } from "../src/utils/format";
import {
  formatPace,
  goalMarathonPaceFromFinishTime,
  paceSecondsPerMile,
} from "../src/utils/pace";
import {
  formatRunWalkRatio,
  formatRunWalkStructure,
  parseRunWalkStructure,
} from "../src/utils/run-walk";
import {
  kilometersToMiles,
  metersToMiles,
  secondsToMinutes,
  secondsToReadableDuration,
} from "../src/utils/units";
import {
  resolveActivityTimezone,
  toAthleteLocalDate,
  toAthleteLocalTime,
} from "../src/utils/timezone";

describe("date utilities", () => {
  it("parses YYYY-MM-DD dates", () => {
    assert.equal(formatDate(parseDate("2026-11-29")), "2026-11-29");
  });

  it("rejects invalid calendar dates", () => {
    assert.throws(() => parseDate("2026-02-30"), /Invalid calendar date/);
  });

  it("calculates Monday-based week ranges", () => {
    const range = getWeekRange(parseDate("2026-06-17"));

    assert.equal(formatDate(range.start), "2026-06-15");
    assert.equal(formatDate(range.end), "2026-06-21");
  });

  it("calculates days until race", () => {
    assert.equal(
      daysUntilRace(parseDate("2026-11-01"), parseDate("2026-11-29")),
      28,
    );
  });

  it("converts UTC activity timestamps to athlete-local dates", () => {
    assert.equal(
      toAthleteLocalDate("2026-06-30T02:15:00Z", "America/New_York"),
      "2026-06-29",
    );
    assert.equal(
      toAthleteLocalDate("2026-07-01T10:30:00Z", "America/New_York"),
      "2026-07-01",
    );
    assert.equal(
      toAthleteLocalDate("2026-12-01T03:00:00Z", "America/New_York"),
      "2026-11-30",
    );
    assert.equal(
      toAthleteLocalDate("2026-06-30T04:30:00Z", "America/New_York"),
      "2026-06-30",
    );
    assert.equal(
      toAthleteLocalDate("2026-06-30T00:00:00Z", "America/New_York"),
      "2026-06-29",
    );
  });

  it("does not shift date-only or local wall-clock timestamps", () => {
    assert.equal(
      toAthleteLocalDate("2026-06-30", "America/New_York"),
      "2026-06-30",
    );
    assert.equal(
      toAthleteLocalDate("2026-06-30T22:15:00", "America/New_York"),
      "2026-06-30",
    );
  });

  it("converts UTC activity timestamps to athlete-local times", () => {
    assert.equal(
      toAthleteLocalTime("2026-06-30T02:15:00Z", "America/New_York"),
      "22:15:00",
    );
  });

  it("resolves valid, missing, and invalid activity timezones deterministically", () => {
    assert.deepEqual(resolveActivityTimezone("America/New_York"), {
      timeZone: "America/New_York",
      warning: null,
    });
    assert.deepEqual(resolveActivityTimezone(undefined), {
      timeZone: "UTC",
      warning:
        "Athlete timezone not configured; activity dates were grouped using UTC.",
    });
    assert.deepEqual(resolveActivityTimezone("Not/A_Timezone"), {
      timeZone: "UTC",
      warning:
        "Athlete timezone was invalid; activity dates were grouped using UTC.",
    });
  });
});

describe("unit utilities", () => {
  it("converts meters to miles", () => {
    assert.equal(Number(metersToMiles(1609.344).toFixed(2)), 1);
  });

  it("converts kilometers to miles", () => {
    assert.equal(Number(kilometersToMiles(5).toFixed(2)), 3.11);
  });

  it("converts seconds to minutes", () => {
    assert.equal(secondsToMinutes(900), 15);
  });

  it("formats readable duration", () => {
    assert.equal(secondsToReadableDuration(3671), "1:01:11");
    assert.equal(secondsToReadableDuration(754), "12:34");
  });
});

describe("pace utilities", () => {
  it("calculates pace from distance and duration", () => {
    const pace = paceSecondsPerMile(3, 1800);

    assert.equal(pace, 600);
    assert.equal(formatPace(pace), "10:00 min/mi");
  });

  it("returns unknown for missing pace inputs", () => {
    assert.equal(formatPace(paceSecondsPerMile(0, 1800)), "unknown");
  });

  it("calculates goal marathon pace from finish time", () => {
    const pace = goalMarathonPaceFromFinishTime("4:30:00");

    assert.equal(formatPace(pace), "10:18 min/mi");
  });
});

describe("missing value formatting", () => {
  it("formats missing values as unknown", () => {
    assert.equal(formatUnknown(undefined), "unknown");
    assert.equal(formatUnknown(null), "unknown");
    assert.equal(formatUnknown(""), "unknown");
  });

  it("preserves provided values", () => {
    assert.equal(formatUnknown(0), "0");
    assert.equal(formatUnknown("easy run"), "easy run");
  });
});

describe("run/walk structure utilities", () => {
  it("parses ratio shorthand formats", () => {
    const structure = parseRunWalkStructure("4/1 run walk");

    assert.equal(structure?.runMinutes, 4);
    assert.equal(structure?.walkMinutes, 1);
    assert.equal(structure?.source, "unknown");
    assert.equal(
      formatRunWalkRatio(parseRunWalkStructure("4:1 run/walk")),
      "4:1",
    );
    assert.equal(formatRunWalkRatio(parseRunWalkStructure("3/1")), "3:1");
  });

  it("parses explicit run and walk minute formats", () => {
    assert.equal(
      formatRunWalkRatio(parseRunWalkStructure("4 min run / 1 min walk")),
      "4:1",
    );
    assert.equal(
      formatRunWalkRatio(parseRunWalkStructure("4m run 1m walk")),
      "4:1",
    );
    assert.equal(
      formatRunWalkRatio(
        parseRunWalkStructure("3 minutes running, 1 minute walking"),
      ),
      "3:1",
    );
  });

  it("parses warmup and cooldown details without hard-coding one ratio", () => {
    const structure = parseRunWalkStructure(
      "2.5 min walk warmup + 5/1 run walk + 5 min walk cooldown",
    );

    assert.equal(structure?.warmupMinutes, 2.5);
    assert.equal(structure?.runMinutes, 5);
    assert.equal(structure?.walkMinutes, 1);
    assert.equal(structure?.cooldownMinutes, 5);
    assert.equal(
      formatRunWalkStructure(structure),
      "2.5 min walk warmup; 5 min run / 1 min walk; 5 min walk cooldown",
    );
  });

  it("parses concise combined warmup and cooldown wording", () => {
    const structure = parseRunWalkStructure(
      "5 min warmup, 3:1 run/walk, 5 min cooldown",
    );

    assert.equal(structure?.warmupMinutes, 5);
    assert.equal(formatRunWalkRatio(structure), "3:1");
    assert.equal(structure?.cooldownMinutes, 5);
  });

  it("parses easy, recovery, and long run labels", () => {
    assert.deepEqual(parseRunWalkStructure("easy run")?.detectedLabels, [
      "easy",
    ]);
    assert.deepEqual(parseRunWalkStructure("recovery run")?.detectedLabels, [
      "recovery",
    ]);

    const longRunWalk = parseRunWalkStructure("long run/walk 4/1");

    assert.equal(longRunWalk?.type, "mixed");
    assert.deepEqual(longRunWalk?.detectedLabels, ["long", "run/walk"]);
    assert.equal(
      formatRunWalkStructure(longRunWalk),
      "long run/walk; 4 min run / 1 min walk",
    );
  });

  it("parses stride and hill-stride structures compactly", () => {
    const strides = parseRunWalkStructure("easy run + 4 x 20 sec strides");
    const hillStrides = parseRunWalkStructure("4x20s hill strides");

    assert.equal(strides?.strides?.count, 4);
    assert.equal(strides?.strides?.seconds, 20);
    assert.equal(strides?.strides?.hill, false);
    assert.equal(
      formatRunWalkStructure(strides),
      "easy run; 4 x 20 sec strides",
    );
    assert.equal(hillStrides?.strides?.hill, true);
    assert.equal(
      formatRunWalkStructure(hillStrides),
      "4 x 20 sec hill strides",
    );
  });

  it("parses future workout labels without judging performance", () => {
    assert.equal(
      formatRunWalkStructure(parseRunWalkStructure("2 x 8 min tempo")),
      "tempo",
    );
    assert.equal(
      formatRunWalkStructure(
        parseRunWalkStructure("3 mi easy + 2 mi marathon effort"),
      ),
      "marathon-effort segment detected",
    );
    assert.equal(
      formatRunWalkStructure(parseRunWalkStructure("progression run")),
      "progression",
    );
  });
});
