# Daily Workflow

Use the coach workflow commands so evidence dates and coaching dates are calculated for you. Daily check-ins are compact by default and omit the full `## Athlete Background` section.

Definitions:

- Evidence date: the completed day whose activities and journal are summarized.
- Coaching date: the day you want coaching for.
- Daily generation always uses evidence date = coaching date minus one day.

## Night Workflow

At the end of the day:

```bash
npm run coach:tonight
```

This uses today as the evidence date and tomorrow as the coaching date. The command creates or reuses `input/journal/YYYY-MM-DD.md`, then generates `output/daily-checkin.md`.

If a journal is created or reused, add subjective details such as soreness, pain, steps, energy, shoes, fueling, and tomorrow constraints. Then rerun:

```bash
npm run coach:tonight
```

Paste `output/daily-checkin.md` into ChatGPT that night to plan tomorrow.

For manual steps, use the Recovery field:

```md
Total Steps: 11k
```

Steps are load context, not walking mileage. Walking mileage comes only from tracked/imported walking activities or explicit manual walk distance entries.

For planned run/walk workouts, add a short structure note in the activity export description when available, for example:

```text
2.5 min walk warmup + 4/1 run walk + 5 min walk cooldown
```

If the export does not preserve that text, use the evidence-day journal fallback:

```md
Workout Structure: 2.5 min walk warmup + 4/1 run walk + 5 min walk cooldown
```

The daily check-in uses this to frame pacing and split variability as planned run/walk context. It does not treat planned walk breaks as separate walking mileage.

The same field can carry lightweight future workout labels:

```text
Easy run/walk 4/1 + 4 x 20 sec relaxed strides
Long run/walk 4/1, easy effort, fueling practice
3 mi easy + 2 mi marathon effort
```

MCPG uses these labels as structure context only. It does not prescribe workouts or judge performance from the label.

The coach workflow runs a check-in completeness validator automatically. If it warns about missing subjective details, edit the evidence-day journal and rerun the same coach command before pasting the output into ChatGPT.

To run the validator separately:

```bash
npm run validate:checkin -- --evidence-date YYYY-MM-DD
```

For a standalone check-in or a new ChatGPT coaching thread, add the full background explicitly:

```bash
npm run coach:tonight -- --include-athlete-background
```

## Recent Coaching Context

Daily check-ins include a compact `## Recent Coaching Context` section after mileage and load. It looks back from the evidence date:

- Last 7 days: evidence date minus 6 days through the evidence date.
- Last 14 days: evidence date minus 13 days through the evidence date.

The section summarizes recent running, walking, high-step days, climbing, strength, tennis, mobility, rest days when inferable, recovery trend, and the last run when available. Steps are load context only and are not counted as walking mileage.

If prior journals or activities are missing, the section says recent context is limited. It never includes raw route points, GPS coordinates, raw export contents, or full journal contents.

Daily check-ins also include `## Day Type / Load Classification`. This labels the evidence day as coaching context, such as `run day`, `high-step no-run day`, `climbing day`, or `mixed-load day`. It is not a medical diagnosis or a fatigue score. Missing data is not treated as rest.

Daily check-ins include `## Recovery Trend Flags` after recent context. This compact section summarizes soreness, pain, gait, and load/recovery patterns from recent journal entries. Missing pain or soreness fields are not treated as pain-free or recovered, gait changes are high-priority safety context, and worsening pain or soreness should be reviewed conservatively by the coach. Trend confidence depends on journal coverage.

## Morning Workflow

If you did not check in the night before:

```bash
npm run coach:morning
```

This uses yesterday as the evidence date and today as the coaching date.

## Explicit Workflow

When catching up or regenerating a specific evidence day:

```bash
npm run coach -- --evidence-date YYYY-MM-DD
```

You can also specify the coaching day:

```bash
npm run coach -- --coaching-date YYYY-MM-DD
```

If both dates are provided, they must be exactly one day apart.

Use `--include-athlete-background` with any coach command when you want the full background section included.

## Activities And Journals

Put Garmin exports in `input/garmin/` and Strava exports in `input/strava/`.

FIT, TCX, or CSV exports are preferred when available because they usually include better summary data than GPX. GPX remains a fallback when summary exports are not available.

Imported activity dates are assigned using the athlete-local IANA timezone from `private/athlete.config.local.json`, such as `America/New_York`. FIT, TCX, GPX, and JSON timestamps may be stored as UTC, so a late-evening local activity can cross midnight in the file timestamp and still belong to the prior local evidence day. MCPG does not use VPN location, download time, or file modified time as the activity date.

Garmin wellness ZIPs can be placed in `input/garmin/` or `input/garmin/wellness/`. The coach workflow decodes them directly, fills blank structured wellness fields in the evidence-day journal, and preserves manual journal values. Garmin may fill fields such as `Total Steps:`, `Sleep Duration:`, `Sleep Score:`, `Resting Heart Rate:`, `Overnight HRV:`, `HRV Status:`, `Garmin Stress:`, and `Body Battery:`.

Subjective fields remain manual: soreness, pain, gait change, energy, fatigue, motivation, and subjective `Stress (0-10 or words):`. Garmin stress is stored separately as `Garmin Stress:` because it is not the same scale as subjective stress.

Imported activities should be the source for runs, walks, and other tracked activities whenever possible. The imported activity section in the journal is reference-only. Do not manually re-enter imported runs, walks, or other exported activities.

Use the journal's `Manual Activities` section for activities that were not imported:

- rock climbing
- tennis
- weights
- yoga
- mobility
- swimming, hiking, or walking only if not tracked/imported

Walking mileage stays separate from running mileage. Cross-training is context, not running mileage.

## Manual Commands

The lower-level commands still work:

```bash
npm run journal -- --date YYYY-MM-DD
npm run generate:daily -- --date YYYY-MM-DD
```

`journal -- --date` is the evidence day. `generate:daily -- --date` is the coaching day. Prefer the `coach:*` commands for daily use.

The journal command does not overwrite existing journals. If an older journal has stale imported activity references, regenerate or manually refresh that journal after correcting exports or timezone config.

`generate:daily` is also compact by default. For standalone/full context:

```bash
npm run generate:daily -- --date YYYY-MM-DD --include-athlete-background
```

## Legacy CSV Workflow

The older CSV files still work:

- `input/manual/daily-notes.csv`
- `input/manual/activity-notes.csv`
- `input/manual/manual-activities.csv`
- `input/manual/plan-notes.md`

Prefer the Markdown journal for normal daily logging.

## Optional Cleanup

Preview old local exports and generated outputs before deleting anything:

```bash
npm run cleanup -- --dry-run
```

Delete eligible old untracked exports and outputs:

```bash
npm run cleanup -- --yes
```

Journals and manual notes are kept by default. Use `--include-journals` only when you intentionally want old journals included.

## Weekly Planning

For Sunday-night or Monday-morning weekly planning:

```bash
npm run coach:weekly
```

For an explicit planning week:

```bash
npm run generate:weekly -- --week-start YYYY-MM-DD
```

The week start is the first day of the planning week. The evidence window is the 7 days immediately before it. Paste `output/weekly-checkin.md` into ChatGPT.
