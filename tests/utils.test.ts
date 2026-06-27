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
  kilometersToMiles,
  metersToMiles,
  secondsToMinutes,
  secondsToReadableDuration,
} from "../src/utils/units";

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
