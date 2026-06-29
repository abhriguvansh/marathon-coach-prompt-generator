import type {
  DailyNote,
  DayLoadClassification,
  JournalEntry,
  ManualActivity,
} from "../types";
import { isHighStepNote, stepApprox } from "../utils/steps";
import { classifyActivities } from "./activity-classification";

export function classifyDayLoad(input: {
  activities: ManualActivity[];
  dailyNote: DailyNote | null;
  journalEntry?: JournalEntry | null;
}): DayLoadClassification {
  const groups = classifyActivities(input.activities);
  const hasRun = groups.runs.length > 0;
  const hasWalk = groups.walks.length > 0;
  const hasClimbing = groups.rockClimbing.length > 0;
  const hasWeights = groups.weights.length > 0;
  const hasTennis = groups.tennis.length > 0;
  const hasMobility = groups.mobility.length > 0;
  const hasOtherMeaningfulActivity = groups.restOrOther.some(
    (activity) => activity.activityType.trim().toLowerCase() !== "rest",
  );
  const hasCrossTraining =
    hasClimbing || hasWeights || hasTennis || hasOtherMeaningfulActivity;
  const steps = input.dailyNote === null ? null : stepApprox(input.dailyNote);
  const hasHighSteps =
    input.dailyNote !== null && isHighStepNote(input.dailyNote);
  const hasModerateSteps = steps !== null && steps >= 7500 && steps <= 10000;
  const hasAnyActivity =
    hasRun ||
    hasWalk ||
    hasClimbing ||
    hasWeights ||
    hasTennis ||
    hasMobility ||
    hasOtherMeaningfulActivity;

  if (hasRun && hasCrossTraining) {
    return mixedRunClassification({ hasClimbing, hasWeights, hasTennis });
  }

  if (hasRun && hasHighSteps) {
    return {
      dayType: "run day with high step load",
      loadClassification: "running load plus high daily movement",
      coachingInterpretation:
        "higher total day load than running mileage alone suggests.",
    };
  }

  if (hasRun) {
    return {
      dayType: "run day",
      loadClassification: "running load",
      coachingInterpretation:
        "evaluate next-day recovery before increasing run volume.",
    };
  }

  if (hasWalk && hasCrossTraining) {
    return {
      dayType: "mixed non-running load day",
      loadClassification: "walking + cross-training",
      coachingInterpretation: "non-running load may still affect recovery.",
    };
  }

  if (hasWalk) {
    return {
      dayType: "walk-only day",
      loadClassification: "walking load, not running mileage",
      coachingInterpretation:
        "walking supports aerobic/recovery load but should stay separate from running mileage.",
    };
  }

  if (hasClimbing) {
    return {
      dayType: "climbing day",
      loadClassification: "cross-training/strength load",
      coachingInterpretation:
        "climbing can add grip, core, hip, and leg fatigue even without running mileage.",
    };
  }

  if (hasWeights) {
    return {
      dayType: "strength day",
      loadClassification: "strength load",
      coachingInterpretation:
        "lower-body strength can affect upcoming run recovery.",
    };
  }

  if (hasTennis) {
    return {
      dayType: "tennis day",
      loadClassification: "lateral/impact cross-training load",
      coachingInterpretation:
        "tennis can add lower-body and lateral movement load.",
    };
  }

  if (hasMobility) {
    return {
      dayType: "mobility/recovery day",
      loadClassification: "low load",
      coachingInterpretation: "recovery-focused day.",
    };
  }

  if (hasHighSteps) {
    return {
      dayType: "high-step no-run day",
      loadClassification: "moderate non-running load",
      coachingInterpretation:
        "not a true rest day; steps count as load context but not walking mileage.",
    };
  }

  if (hasModerateSteps) {
    return {
      dayType: "moderate-step no-run day",
      loadClassification: "light-to-moderate non-running load",
      coachingInterpretation:
        "daily movement adds recovery/load context but is not walking mileage.",
    };
  }

  if (
    !hasAnyActivity &&
    (steps === null || steps < 7500) &&
    hasExplicitRest(input.dailyNote, input.journalEntry ?? null)
  ) {
    return {
      dayType: "true rest day",
      loadClassification: "low load",
      coachingInterpretation:
        "low-load day supports recovery if soreness and pain remain controlled.",
    };
  }

  return {
    dayType: "no-run day",
    loadClassification: "limited context",
    coachingInterpretation:
      "no running was found, but total daily load is uncertain because steps/manual activities are missing.",
  };
}

export function hasExplicitRest(
  dailyNote: DailyNote | null,
  journalEntry: JournalEntry | null,
): boolean {
  const text = [dailyNote?.notes, journalEntry?.coachNotes]
    .filter((value): value is string => value !== null && value !== undefined)
    .join(" ")
    .toLowerCase();

  return /\b(rest day|no run|no running|no activity|rested)\b/.test(text);
}

function mixedRunClassification(input: {
  hasClimbing: boolean;
  hasWeights: boolean;
  hasTennis: boolean;
}): DayLoadClassification {
  if (input.hasClimbing) {
    return {
      dayType: "mixed-load day",
      loadClassification: "run + climbing",
      coachingInterpretation:
        "higher musculoskeletal load than running mileage alone suggests.",
    };
  }

  if (input.hasWeights) {
    return {
      dayType: "mixed-load day",
      loadClassification: "run + strength",
      coachingInterpretation:
        "monitor soreness because run plus strength can stack lower-body load.",
    };
  }

  if (input.hasTennis) {
    return {
      dayType: "mixed-load day",
      loadClassification: "run + tennis",
      coachingInterpretation:
        "monitor impact/lateral load before the next run.",
    };
  }

  return {
    dayType: "mixed-load day",
    loadClassification: "mixed load",
    coachingInterpretation:
      "higher total load than running mileage alone suggests.",
  };
}
