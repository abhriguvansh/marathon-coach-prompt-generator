# Daily Workflow

Use this routine at the end of each day to prepare a coaching prompt for the next day.

## 1. Export Activities If Available

Put Garmin exports in `input/garmin/` and Strava exports in `input/strava/`.

Imported activities should be the source for runs, walks, and other tracked activities whenever possible.

FIT, TCX, or CSV exports are preferred when available because they usually include better summary data than GPX. GPX remains a fallback when summary exports are not available.

## 2. Create Or Open The Journal

```bash
npm run journal
```

For a specific date:

```bash
npm run journal -- --date YYYY-MM-DD
```

The journal date is the completed evidence day: the day that just happened. The command creates `input/journal/YYYY-MM-DD.md` and does not overwrite an existing journal.

Do not create the journal for the coaching day unless you are actually logging that day's completed activity.

## 3. Fill Out The Journal

Add recovery, soreness, pain, gait changes, fatigue, sleep, stress, nutrition, gear notes, coach notes, and questions.

The imported activity section is reference-only. Do not manually re-enter imported runs, walks, or other exported activities.

## 4. Add Manual-Only Activities

Use the journal's `Manual Activities` section for activities that were not imported:

- rock climbing
- tennis
- weights
- yoga
- mobility
- swimming, hiking, or walking only if not tracked/imported

Walking mileage stays separate from running mileage. Cross-training is context, not running mileage.

## 5. Run The Daily Generator

```bash
npm run generate:daily -- --date YYYY-MM-DD
```

The daily generator date is the coaching day. It uses the previous day as evidence.

Example end-of-day flow:

```bash
npm run journal -- --date 2026-06-27
npm run generate:daily -- --date 2026-06-28
```

This creates/fills the journal for June 27, 2026, then generates a coaching check-in for June 28, 2026.

This writes:

```txt
output/daily-checkin.md
```

## 6. Paste Into ChatGPT

Open `output/daily-checkin.md`, copy the Markdown, and paste it into ChatGPT.

Paste it into ChatGPT on the night of the evidence day to plan tomorrow, or on the morning of the coaching day to plan the current day. Ask ChatGPT to recommend the day while prioritizing injury prevention, consistency, and the distinction between running, walking, and cross-training.

## 7. Review And Update Notes

If the coaching response changes the plan, update future journal notes or:

```txt
input/manual/plan-notes.md
```

`plan-notes.md` is part of the legacy manual workflow but remains supported.

## Legacy CSV Workflow

The older CSV files still work:

- `input/manual/daily-notes.csv`
- `input/manual/activity-notes.csv`
- `input/manual/manual-activities.csv`
- `input/manual/plan-notes.md`

Prefer the Markdown journal for normal daily logging.
