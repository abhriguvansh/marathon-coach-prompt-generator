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

## 2. Create Private Manual Input Files

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

## 3. Confirm Files Are Ignored

Run:

```bash
git status --short --ignored
```

The private config, real manual CSV files, real plan notes, exports, and generated output should appear as ignored or not appear as commit candidates.

## 4. Inspect Local Setup

Run:

```bash
npm run inspect
```

Inspect reports file presence and safe export counts. It does not print private file contents.

## 5. Generate Daily And Weekly Files

Daily:

```bash
npm run generate:daily -- --date YYYY-MM-DD
```

Weekly:

```bash
npm run generate:weekly -- --week-start YYYY-MM-DD
```

The weekly start date must be a Monday.

## 6. Do Not Commit Private Files

Before committing:

```bash
npm run privacy:check
git status --short --ignored
```

Commit only public-safe code, docs, templates, fake examples, and synthetic tests.
