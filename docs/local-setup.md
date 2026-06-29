# Local Setup

Use this guide to create real local files safely. These files are ignored by Git and should not be committed.

## 1. Create Private Athlete Config

PowerShell:

```powershell
Copy-Item config/athlete.example.json private/athlete.config.local.json
```

macOS/Linux shell:

```bash
cp config/athlete.example.json private/athlete.config.local.json
```

Edit `private/athlete.config.local.json` with your real race, goal, training background, lifestyle activity, cross-training, and unit preferences.

## 2. Run Your First Daily Coach Workflow

The recommended workflow uses one ignored Markdown journal for the completed evidence day and generates a compact check-in for the coaching day.

At night:

```bash
npm run coach:tonight
```

In the morning:

```bash
npm run coach:morning
```

For a specific completed evidence day:

```bash
npm run coach -- --evidence-date YYYY-MM-DD
```

The command creates or reuses `input/journal/YYYY-MM-DD.md` without overwriting an existing journal, then generates `output/daily-checkin.md`. Fill the journal in with recovery, nutrition, gear, coach notes, questions, and manual-only activities, then rerun the same command.

Compact daily check-ins omit the full `## Athlete Background` section. For a standalone check-in or a new ChatGPT coaching thread, add `--include-athlete-background`.

The coach workflow also runs check-in completeness validation automatically. It warns about missing subjective fields such as soreness, pain, gait changes, energy, steps, sleep, shoes, fueling, and tomorrow constraints. These warnings do not block generation.

## 3. Optional Legacy Manual CSV Files

The legacy CSV workflow still works. Use these only if you prefer CSVs or need bulk editing.

PowerShell:

```powershell
Copy-Item input/manual/daily-notes.template.csv input/manual/daily-notes.csv
Copy-Item input/manual/activity-notes.template.csv input/manual/activity-notes.csv
Copy-Item input/manual/manual-activities.template.csv input/manual/manual-activities.csv
Copy-Item input/manual/plan-notes.template.md input/manual/plan-notes.md
```

macOS/Linux shell:

```bash
cp input/manual/daily-notes.template.csv input/manual/daily-notes.csv
cp input/manual/activity-notes.template.csv input/manual/activity-notes.csv
cp input/manual/manual-activities.template.csv input/manual/manual-activities.csv
cp input/manual/plan-notes.template.md input/manual/plan-notes.md
```

## 4. Confirm Files Are Ignored

Run:

```bash
git status --short --ignored
```

The private config, real daily journals, real manual CSV files, real plan notes, exports, and generated output should appear as ignored or not appear as commit candidates.

## 5. Inspect Local Setup

Run:

```bash
npm run inspect
```

Inspect reports file presence and safe export counts. It does not print private file contents.

If you use local Garmin or Strava exports, place them in `input/garmin/` or `input/strava/`. FIT, TCX, or CSV exports are preferred when available; GPX can be used as a fallback. Real export files remain ignored by Git.

## 6. Optional Cleanup

Preview cleanup before deleting anything:

```bash
npm run cleanup -- --dry-run
```

Delete eligible old untracked exports and generated outputs:

```bash
npm run cleanup -- --yes
```

Journals and manual notes are kept by default. Clean journals only when explicitly desired:

```bash
npm run cleanup -- --include-journals --older-than-days 90 --dry-run
```

## 7. Generate Daily And Weekly Files

Daily recommended:

```bash
npm run coach:tonight
```

Standalone/full context:

```bash
npm run coach:tonight -- --include-athlete-background
```

Daily explicit:

```bash
npm run coach -- --evidence-date YYYY-MM-DD
```

Check completeness only:

```bash
npm run validate:checkin -- --evidence-date YYYY-MM-DD
```

Manual lower-level commands:

```bash
npm run journal -- --date 2026-06-27
npm run generate:daily -- --date 2026-06-28
```

The journal date is the completed evidence day. The daily generation date is the coaching day.

Direct daily generation is compact by default. Use `npm run generate:daily -- --date YYYY-MM-DD --include-athlete-background` when you need the full background.

Weekly:

```bash
npm run coach:weekly
```

For an explicit planning week:

```bash
npm run generate:weekly -- --week-start YYYY-MM-DD
```

Weekly planning writes `output/weekly-checkin.md`. The week start is the first day of the planning week; the evidence window is the 7 days before it.

The weekly start date must be a Monday.

## 7. Do Not Commit Private Files

Before committing:

```bash
npm run privacy:check
git status --short --ignored
```

Commit only public-safe code, docs, templates, fake examples, and synthetic tests.
