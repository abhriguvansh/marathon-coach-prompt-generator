import type {
  ActivityNote,
  JournalEntry,
  ManualActivity,
  RunWalkStructure,
} from "../types";

export function parseRunWalkStructure(
  text: string | null | undefined,
  source: RunWalkStructure["source"] = "unknown",
): RunWalkStructure | null {
  if (!text) {
    return null;
  }

  const normalized = text.toLowerCase();
  const ratio = parseRatio(normalized) ?? parseExplicitRunWalk(normalized);
  const warmup = parseWarmup(normalized);
  const cooldown = parseCooldown(normalized);
  const strides = parseStrides(normalized);
  const detectedLabels = detectWorkoutLabels(normalized, Boolean(ratio));

  if (
    !ratio &&
    warmup === null &&
    cooldown === null &&
    strides === null &&
    detectedLabels.length === 0
  ) {
    return null;
  }

  return {
    type: workoutType(detectedLabels, ratio !== null, strides?.hill ?? false),
    warmupMinutes: warmup ?? undefined,
    warmupType: warmup === null ? undefined : "walk",
    runMinutes: ratio?.runMinutes,
    walkMinutes: ratio?.walkMinutes,
    cooldownMinutes: cooldown ?? undefined,
    cooldownType: cooldown === null ? undefined : "walk",
    strides: strides ?? undefined,
    detectedLabels: detectedLabels.length === 0 ? undefined : detectedLabels,
    source,
  };
}

export function enrichRunWalkStructures(input: {
  activities: ManualActivity[];
  activityNotes?: ActivityNote[];
  dailyNoteText?: string | null;
  journalEntry?: JournalEntry | null;
}): ManualActivity[] {
  const journalStructure = parseRunWalkStructure(
    [
      input.journalEntry?.workoutStructure,
      input.journalEntry?.runWalkFormat,
      input.journalEntry?.coachNotes,
      input.dailyNoteText,
    ]
      .filter((value): value is string => value !== null && value !== undefined)
      .join(" "),
    "journal",
  );

  return input.activities.map((activity) => {
    if (!isRunActivity(activity)) {
      return activity;
    }

    const existing = activity.runWalkStructure ?? null;
    const activityStructure =
      existing ??
      parseRunWalkStructure(activity.notes, "activity_description") ??
      parseRunWalkStructure(
        input.activityNotes?.find(
          (note) =>
            note.date === activity.date &&
            note.activityType.trim().toLowerCase() ===
              activity.activityType.trim().toLowerCase(),
        )?.details,
        "activity_description",
      );
    const structure = activityStructure ?? journalStructure;
    const conflict =
      activityStructure &&
      journalStructure &&
      activityStructure.runMinutes !== undefined &&
      activityStructure.walkMinutes !== undefined &&
      journalStructure.runMinutes !== undefined &&
      journalStructure.walkMinutes !== undefined &&
      !sameRunWalkRatio(activityStructure, journalStructure);

    return {
      ...activity,
      runWalkStructure: structure,
      dataQualityNotes: conflict
        ? [
            ...(activity.dataQualityNotes ?? []),
            "Workout structure differed between activity description and journal; using activity description.",
          ]
        : activity.dataQualityNotes,
    };
  });
}

export function formatRunWalkStructure(
  structure: RunWalkStructure | null | undefined,
): string | null {
  if (!structure) {
    return null;
  }

  const parts = [
    ...formatDetectedLabels(structure),
    structure.warmupMinutes === undefined
      ? null
      : `${formatMinutes(structure.warmupMinutes)} walk warmup`,
    structure.runMinutes === undefined || structure.walkMinutes === undefined
      ? null
      : `${formatMinutes(structure.runMinutes)} run / ${formatMinutes(
          structure.walkMinutes,
        )} walk`,
    structure.cooldownMinutes === undefined
      ? null
      : `${formatMinutes(structure.cooldownMinutes)} walk cooldown`,
    formatStrides(structure),
  ].filter((part): part is string => part !== null);

  return parts.length === 0 ? null : parts.join("; ");
}

export function formatRecentWorkoutStructure(
  structure: RunWalkStructure | null | undefined,
): string | null {
  const ratio = formatRunWalkRatio(structure);

  if (!structure) {
    return null;
  }

  const labels = structure.detectedLabels ?? [];
  const prefix = labels.find((label) =>
    ["easy", "recovery", "long"].includes(label),
  );
  const strides = formatStrides(structure);

  return [
    prefix === undefined
      ? null
      : `${prefix} ${ratio === null ? "run" : "run/walk"}`,
    ratio === null || prefix !== undefined ? null : `run/walk (${ratio})`,
    strides,
    labels.includes("marathon effort") ? "marathon-effort segment" : null,
    labels.includes("tempo") ? "tempo" : null,
    labels.includes("progression") ? "progression" : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" with ");
}

export function formatRunWalkRatio(
  structure: RunWalkStructure | null | undefined,
): string | null {
  if (
    !structure ||
    structure.runMinutes === undefined ||
    structure.walkMinutes === undefined
  ) {
    return null;
  }

  return `${formatNumber(structure.runMinutes)}:${formatNumber(
    structure.walkMinutes,
  )}`;
}

function parseRatio(text: string) {
  const runWalkRatio = text.match(
    /(?:run\s*\/?\s*walk\s*)?(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)(?:\s*(?:run\s*\/?\s*walk|run\s+walk))?/,
  );

  if (!runWalkRatio) {
    return null;
  }

  return {
    runMinutes: Number(runWalkRatio[1]),
    walkMinutes: Number(runWalkRatio[2]),
  };
}

function parseExplicitRunWalk(text: string) {
  const runFirst = text.match(
    /(?:run(?:ning)?\s*)?(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)\s*run(?:ning)?\s*[/,]?\s*(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)\s*walk(?:ing)?/,
  );

  if (runFirst) {
    return {
      runMinutes: Number(runFirst[1]),
      walkMinutes: Number(runFirst[2]),
    };
  }

  const labelFirst = text.match(
    /run\s*(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)\s*walk\s*(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)/,
  );

  if (!labelFirst) {
    return null;
  }

  return {
    runMinutes: Number(labelFirst[1]),
    walkMinutes: Number(labelFirst[2]),
  };
}

function parseStrides(
  text: string,
): NonNullable<RunWalkStructure["strides"]> | null {
  const structured = text.match(
    /(\d+)\s*x\s*(\d+)\s*(?:s|sec|second|seconds)\s+(?:relaxed\s+)?(?:hill\s+)?strides?/,
  );
  const compact = text.match(
    /(\d+)x(\d+)\s*(?:s|sec|second|seconds)\s+(?:relaxed\s+)?(?:hill\s+)?strides?/,
  );
  const match = structured ?? compact;

  if (match) {
    return {
      count: Number(match[1]),
      seconds: Number(match[2]),
      hill: /\bhill\s+strides?\b|\bhill\s+\d+\s*x/i.test(text),
    };
  }

  if (/\bhill\s+strides?\b/.test(text)) {
    return { hill: true };
  }

  if (/\brelaxed\s+strides?\b|\bstrides?\b/.test(text)) {
    return { hill: false };
  }

  return null;
}

function detectWorkoutLabels(text: string, hasRunWalkRatio: boolean): string[] {
  const labels: string[] = [];

  if (/\beasy\s+run(?:\s*\/\s*walk|\s+walk)?\b/.test(text)) {
    labels.push("easy");
  }

  if (/\brecovery\s+run(?:\s*\/\s*walk|\s+walk)?\b/.test(text)) {
    labels.push("recovery");
  }

  if (/\blong\s+run(?:\s*\/\s*walk|\s+walk)?\b/.test(text)) {
    labels.push("long");
  }

  if (hasRunWalkRatio || /\brun\s*\/?\s*walk\b/.test(text)) {
    labels.push("run/walk");
  }

  if (/\bhill\s+strides?\b|\bhill\s+\d+\s*x/.test(text)) {
    labels.push("hill strides");
  } else if (/\bstrides?\b/.test(text)) {
    labels.push("strides");
  }

  if (/\btempo\b/.test(text)) {
    labels.push("tempo");
  }

  if (/\bmarathon\s+(?:effort|pace)\b/.test(text)) {
    labels.push("marathon effort");
  }

  if (/\bprogression\s+run\b|\bprogression\b/.test(text)) {
    labels.push("progression");
  }

  if (/\bfueling\s+practice\b/.test(text)) {
    labels.push("fueling practice");
  }

  return dedupe(labels);
}

function workoutType(
  labels: string[],
  hasRunWalkRatio: boolean,
  hillStrides: boolean,
): RunWalkStructure["type"] {
  const types = [
    labels.includes("easy") ? "easy" : null,
    labels.includes("recovery") ? "recovery" : null,
    labels.includes("long") ? "long" : null,
    hasRunWalkRatio || labels.includes("run/walk") ? "run_walk" : null,
    hillStrides || labels.includes("hill strides") ? "hill_strides" : null,
    labels.includes("strides") ? "strides" : null,
    labels.includes("tempo") ? "tempo" : null,
    labels.includes("marathon effort") ? "marathon_effort" : null,
    labels.includes("progression") ? "progression" : null,
  ].filter(
    (type): type is NonNullable<RunWalkStructure["type"]> => type !== null,
  );

  if (types.length === 0) {
    return "unknown";
  }

  return types.length === 1 ? types[0] : "mixed";
}

function parseWarmup(text: string): number | null {
  return (
    matchMinutes(
      text,
      /(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)\s*(?:walk\s*)?warm-?up/,
    ) ??
    matchMinutes(
      text,
      /(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)\s*warm-?up\s*walk/,
    )
  );
}

function parseCooldown(text: string): number | null {
  return (
    matchMinutes(
      text,
      /(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)\s*(?:walk\s*)?cool\s*-?\s*down/,
    ) ??
    matchMinutes(
      text,
      /(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)\s*cool\s*-?\s*down\s*walk/,
    )
  );
}

function matchMinutes(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);

  return match ? Number(match[1]) : null;
}

function sameRunWalkRatio(
  left: RunWalkStructure,
  right: RunWalkStructure,
): boolean {
  return (
    left.runMinutes === right.runMinutes &&
    left.walkMinutes === right.walkMinutes
  );
}

function isRunActivity(activity: ManualActivity): boolean {
  return activity.activityType.trim().toLowerCase().includes("run");
}

function formatDetectedLabels(structure: RunWalkStructure): string[] {
  const labels = structure.detectedLabels ?? [];
  const hasRunWalk = labels.includes("run/walk");
  const primary = labels
    .filter((label) => ["easy", "recovery", "long"].includes(label))
    .map((label) => `${label} ${hasRunWalk ? "run/walk" : "run"}`);
  const remaining = labels.filter(
    (label) =>
      label !== "run/walk" &&
      label !== "strides" &&
      label !== "hill strides" &&
      !["easy", "recovery", "long"].includes(label),
  );

  return [...primary, ...remaining].map((label) =>
    label === "marathon effort" ? "marathon-effort segment detected" : label,
  );
}

function formatStrides(
  structure: RunWalkStructure | null | undefined,
): string | null {
  const strides = structure?.strides;

  if (!strides) {
    return null;
  }

  const label = strides.hill ? "hill strides" : "strides";

  if (strides.count !== undefined && strides.seconds !== undefined) {
    return `${strides.count} x ${strides.seconds} sec ${label}`;
  }

  return label;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function formatMinutes(value: number): string {
  return `${formatNumber(value)} min`;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}
