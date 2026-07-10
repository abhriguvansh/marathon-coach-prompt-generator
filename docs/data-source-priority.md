# Data Source Priority

The governing rule is:

```text
direct athlete report > manual journal > trusted imported source > inferred/default value
```

Direct athlete statements made outside the repository remain authoritative during coaching review. Do not silently average or blend conflicting values. Preserve provenance in debug output and use human-readable source labels in generated output.

## Steps

1. Manual journal value.
2. Trusted Garmin daily/cumulative step selection for the athlete-local date.
3. Unavailable.

Manual steps are preserved even when Garmin differs materially. Step counts are load context, never walking mileage.

## Sleep

1. Manual journal value.
2. Garmin sleep CSV.
3. Garmin wellness ZIP.
4. Unavailable.

Sleep is selected only for its exact athlete-local date. Do not use orphan stage segments, a filename date, or a neighboring day to fill a gap.

## Activities

1. Explicit athlete/manual activity-type correction.
2. Explicit manual full-session distance or duration correction.
3. Garmin activity metrics.
4. Strava fallback or validation metrics.
5. Unavailable.

A full-session correction replaces only distance and/or duration and retains available device metrics from the recorded portion. When Garmin and Strava describe the same activity, high-confidence duplicate detection counts one record; uncertain matches stay in totals and warn. Do not permit cross-date matching or duplicate Garmin/Strava counting.

## Recovery fields

1. Manual journal or direct athlete report.
2. Trusted wellness import.
3. Unknown/default.

Subjective soreness, pain, gait, energy, fatigue, motivation, and subjective stress remain athlete-entered. Garmin Stress is a separate device metric, not subjective stress.

## Constraints

Use explicit future-facing journal or configuration constraints (for example, upcoming travel or scheduling). Exclude historical completed-day notes unless they clearly establish a future constraint.

See [architecture](architecture.md) for the resolution pipeline and [coaching domain rules](coaching-domain-rules.md) for interpretation.
