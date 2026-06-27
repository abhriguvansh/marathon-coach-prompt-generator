# Daily Workflow

Use this routine when you want a daily coaching prompt.

## 1. Update Manual Notes

Add or update the row for the evidence day in:

```txt
input/manual/daily-notes.csv
```

Include recovery, soreness, pain, gait changes, fatigue, sleep, stress, steps, and brief notes.

## 2. Update Activities

Add manual activities in:

```txt
input/manual/manual-activities.csv
```

Use this for runs, walks, strength, mobility, climbing, tennis, rest, or other context you want included.

Walking mileage stays separate from running mileage. Cross-training is context, not running mileage.

## 3. Add Optional Activity Notes

Use:

```txt
input/manual/activity-notes.csv
```

Add notes such as shoes, terrain, fueling, perceived effort, weather, or why an activity felt easier or harder than expected.

## 4. Optionally Add Local Exports

Place Garmin exports in `input/garmin/` and Strava exports in `input/strava/`.

Exports may overlap with manual entries. The tool will warn about likely duplicates.

## 5. Run The Daily Generator

```bash
npm run generate:daily -- --date YYYY-MM-DD
```

This writes:

```txt
output/daily-checkin.md
```

## 6. Paste Into ChatGPT

Open `output/daily-checkin.md`, copy the Markdown, and paste it into ChatGPT.

Ask ChatGPT to recommend the day while prioritizing injury prevention, consistency, and the distinction between running, walking, and cross-training.

## 7. Review And Update Plan Notes

If the coaching response changes the plan, update:

```txt
input/manual/plan-notes.md
```

Keep plan notes concise and practical.
