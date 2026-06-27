import type { ManualActivity } from "../types";

const RUN_TYPES = new Set(["run"]);
const WALK_TYPES = new Set(["walk", "hike"]);
const WEIGHTS_TYPES = new Set(["weights", "strength"]);

export interface ActivityGroups {
  runs: ManualActivity[];
  walks: ManualActivity[];
  rockClimbing: ManualActivity[];
  tennis: ManualActivity[];
  weights: ManualActivity[];
  mobility: ManualActivity[];
  restOrOther: ManualActivity[];
}

export function classifyActivities(
  activities: ManualActivity[],
): ActivityGroups {
  return {
    runs: activities.filter((activity) => isRun(activity)),
    walks: activities.filter((activity) => isWalk(activity)),
    rockClimbing: activities.filter(
      (activity) =>
        normalizeActivityType(activity.activityType) === "rock_climbing",
    ),
    tennis: activities.filter(
      (activity) => normalizeActivityType(activity.activityType) === "tennis",
    ),
    weights: activities.filter((activity) => isWeights(activity)),
    mobility: activities.filter(
      (activity) => normalizeActivityType(activity.activityType) === "mobility",
    ),
    restOrOther: activities.filter((activity) => {
      const type = normalizeActivityType(activity.activityType);

      return type === "rest" || type === "other";
    }),
  };
}

export function sumMileage(activities: ManualActivity[]): number {
  return activities.reduce(
    (total, activity) => total + (activity.distanceMiles ?? 0),
    0,
  );
}

export function sumDurationMinutes(activities: ManualActivity[]): number {
  return activities.reduce(
    (total, activity) => total + (activity.durationMinutes ?? 0),
    0,
  );
}

export function normalizeActivityType(activityType: string): string {
  return activityType.trim().toLowerCase();
}

function isRun(activity: ManualActivity): boolean {
  return RUN_TYPES.has(normalizeActivityType(activity.activityType));
}

function isWalk(activity: ManualActivity): boolean {
  return WALK_TYPES.has(normalizeActivityType(activity.activityType));
}

function isWeights(activity: ManualActivity): boolean {
  return WEIGHTS_TYPES.has(normalizeActivityType(activity.activityType));
}
