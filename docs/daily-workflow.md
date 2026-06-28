# Daily Workflow

Use the coach workflow commands so evidence dates and coaching dates are calculated for you.

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

## Activities And Journals

Put Garmin exports in `input/garmin/` and Strava exports in `input/strava/`.

FIT, TCX, or CSV exports are preferred when available because they usually include better summary data than GPX. GPX remains a fallback when summary exports are not available.

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

## Legacy CSV Workflow

The older CSV files still work:

- `input/manual/daily-notes.csv`
- `input/manual/activity-notes.csv`
- `input/manual/manual-activities.csv`
- `input/manual/plan-notes.md`

Prefer the Markdown journal for normal daily logging.
