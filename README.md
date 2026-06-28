# Marathon Coach Prompt Generator

A private, local command-line tool for turning marathon training notes and local activity exports into clean Markdown that you can paste into ChatGPT for coaching help.

## Plain-English Overview

This project helps you collect the evidence a coach would need: recent runs, walks, recovery notes, pain flags, schedule context, and race goals. It then writes a daily check-in or weekly summary as a Markdown file.

The tool does not coach by itself. It prepares a clear prompt for ChatGPT while keeping your real training data on your computer.

## Why This Exists

Marathon training data is scattered across notes, watches, exported files, and memory. It can also be sensitive: health, location, schedule, and recovery details do not belong in a public repository.

This project keeps the workflow local, explicit, and easy to audit before anything is committed or published.

## What This Tool Does

- Reads private local athlete config from `private/`.
- Reads private daily Markdown journals from `input/journal/`.
- Still supports legacy private manual CSV notes from `input/manual/`.
- Reads supported local Garmin and Strava export files from ignored folders.
- Keeps running mileage separate from walking mileage.
- Treats cross-training, steps, climbing, weights, tennis, and mobility as context, not running mileage.
- Generates `output/daily-checkin.md` and `output/weekly-summary.md`.
- Provides fake demo outputs that are safe for public GitHub.
- Provides privacy checks before committing or publishing.

## What This Tool Does Not Do

- No web app.
- No Garmin API.
- No Strava API.
- No OAuth.
- No cloud sync.
- No OpenAI API calls.
- No authentication.
- No database.
- No raw route-point or coordinate output.
- No medical diagnosis or injury treatment plan.

## Privacy Model

The public repository contains code, templates, docs, fake examples, and synthetic tests. Your real data belongs only in ignored local files.

The tool should not print raw private file contents during inspection or export parsing. Generated daily and weekly Markdown may contain private training details, so generated files are written under `output/`, which is ignored by Git.

## Public GitHub Safety Warning

Before committing or publishing, assume these are private:

- `private/athlete.config.local.json`
- `input/manual/daily-notes.csv`
- `input/manual/activity-notes.csv`
- `input/manual/manual-activities.csv`
- `input/manual/plan-notes.md`
- any Garmin, Strava, GPX, TCX, FIT, JSON, CSV, screenshot, or activity export with real data
- anything under `output/`
- `.env` files, tokens, secrets, or credentials

Run `npm run privacy:check` and inspect `git status --short --ignored` before every public commit.

## Folder Structure

```txt
config/                 Public example config only
private/                Ignored local athlete config
input/manual/           Public templates and ignored local notes
input/journal/          Public journal template and ignored daily journals
input/garmin/           Ignored local Garmin exports
input/strava/           Ignored local Strava exports
output/                 Ignored generated summaries
examples/               Fake demo output safe for public GitHub
docs/                   Public setup and safety docs
src/                    TypeScript CLI source code
tests/                  Unit tests and synthetic fixtures
```

## Installation

Install Node.js 18 or newer, then run:

```bash
npm install
npm run inspect
npm run build
npm test
```

## First-Time Setup

Create private local working files from the public examples and templates.

PowerShell:

```powershell
Copy-Item config/athlete.example.json private/athlete.config.local.json
npm run journal
```

macOS/Linux shell:

```bash
cp config/athlete.example.json private/athlete.config.local.json
npm run journal
```

Then run:

```bash
npm run inspect
```

## Creating Private Athlete Config

Edit `private/athlete.config.local.json` with your real local race and training context. This file is ignored by Git.

Keep public config files fake. Do not put real athlete names, real race logistics, private travel, or health details in `config/athlete.example.json`.

## Creating Daily Journals

The recommended daily workflow uses one readable Markdown file for the day that just happened. This is the evidence day: the completed day you are logging at the end of the day.

```bash
npm run journal
```

For a specific date:

```bash
npm run journal -- --date YYYY-MM-DD
```

`npm run journal -- --date YYYY-MM-DD` means: create or open the journal for the completed evidence day. Do not create the journal for the coaching day unless you are actually logging that day's completed activity.

This creates:

```txt
input/journal/YYYY-MM-DD.md
```

The command does not overwrite an existing journal. When Garmin or Strava exports exist for the same date, the journal is prefilled with an imported activity reference section. That section is read-only context so you do not manually re-enter activities already imported from exports.

Daily journals capture recovery, sleep, stress, nutrition, gear notes, coach notes, questions for ChatGPT, and manual-only activities such as climbing, weights, mobility, tennis, yoga, or anything that was not imported.

Example end-of-day flow:

```bash
npm run journal -- --date 2026-06-27
npm run generate:daily -- --date 2026-06-28
```

That creates/fills the journal for June 27, 2026, then generates the coaching check-in for June 28, 2026. You can paste the output into ChatGPT on the night of June 27 to plan tomorrow, or on the morning of June 28 to plan the current day.

Real daily journals are ignored by Git. Only `input/journal/template.md` is committed.

## Legacy Manual CSV Templates

The CSV workflow still works, but it is now considered legacy. Prefer the Markdown journal for daily logging unless you have an existing CSV habit or need bulk editing.

The committed templates are:

- `input/manual/daily-notes.template.csv`
- `input/manual/activity-notes.template.csv`
- `input/manual/manual-activities.template.csv`
- `input/manual/plan-notes.template.md`

The private working files are:

- `input/manual/daily-notes.csv`
- `input/manual/activity-notes.csv`
- `input/manual/manual-activities.csv`
- `input/manual/plan-notes.md`

The private working files are ignored by Git.

## Filling In Daily Notes

In the recommended workflow, fill in `input/journal/YYYY-MM-DD.md` for date-level recovery and readiness context: soreness, pain, gait changes, fatigue, energy, sleep, stress, nutrition, gear, coach notes, and questions.

In the legacy CSV workflow, use `daily-notes.csv` for soreness, pain, gait changes, fatigue, energy, sleep, stress, motivation, steps, and short notes.

Use one row per day. Keep notes concise enough that the generated prompt remains readable.

## Filling In Activity Notes

In the recommended workflow, add gear, nutrition, and coach notes to the daily journal.

In the legacy CSV workflow, use `activity-notes.csv` for notes about activities already represented elsewhere, such as gear, fueling, terrain, perceived effort, or anything you want the coaching prompt to know.

This file is useful when an export has numbers but not enough context.

## Filling In Manual Activities

In the recommended workflow, use the journal's `Manual Activities` section only for activities that were not imported from Garmin or Strava.

In the legacy CSV workflow, use `manual-activities.csv` for activities you enter yourself: runs, walks, strength, climbing, tennis, mobility, rest, and other training context.

Walking mileage stays separate from running mileage. Cross-training is context and is not counted as running mileage.

## Adding Garmin/Strava Local Exports

Put real local exports in ignored folders:

```txt
input/garmin/
input/strava/
```

These files may contain GPS, heart-rate, route, health, and schedule details. Do not commit them.

## Supported Export Formats

Best-effort local parsing is available for:

- `.fit`
- `.csv`
- `.tcx`
- `.gpx`
- `.json`

Prefer FIT, TCX, or CSV exports when available because they usually include better activity summary data than GPX. GPX remains useful as a fallback when summary exports are not available.

Run:

```bash
npm run parse:exports
```

The command prints safe counts and summaries. It does not print raw route points, coordinates, raw binary data, or raw private file contents.

## FIT Support

FIT parsing uses a small local summary parser instead of an added dependency. It reads session/lap-level summary fields such as date, activity type, distance, elapsed time, moving time, pace, speed, elevation gain/loss, heart rate, cadence, calories, training effect, temperature, device labels, and lap/split summaries when those fields are present. Route details, GPS points, coordinates, and raw binary contents are intentionally omitted.

If a FIT file is corrupt or uses unsupported message layouts, the tool warns and skips it instead of printing private contents.

## Generating Daily Check-In

Run:

```bash
npm run generate:daily -- --date YYYY-MM-DD
```

`npm run generate:daily -- --date YYYY-MM-DD` means: generate the coaching check-in for that coaching day. The daily generator uses the previous day as evidence.

Example:

```bash
npm run journal -- --date 2026-06-27
npm run generate:daily -- --date 2026-06-28
```

This writes:

```txt
output/daily-checkin.md
```

This uses the June 27 journal/export data as evidence and writes a June 28 coaching check-in. The output can be pasted into ChatGPT on the night of June 27 or the morning of June 28.

To print the generated Markdown to the terminal:

```bash
npm run generate:daily -- --date 2026-06-28 --preview
```

## Generating Weekly Summary

Run:

```bash
npm run generate:weekly -- --week-start YYYY-MM-DD
```

The week start must be a Monday.

Example:

```bash
npm run generate:weekly -- --week-start 2026-06-22
```

This writes:

```txt
output/weekly-summary.md
```

To print the generated Markdown to the terminal:

```bash
npm run generate:weekly -- --week-start 2026-06-22 --preview
```

## Running Journal

Create the journal for the completed day you are logging:

```bash
npm run journal
```

Create a journal for a specific date:

```bash
npm run journal -- --date YYYY-MM-DD
```

The command creates an ignored local file under `input/journal/` and does not overwrite an existing journal. This date is the evidence day, not the coaching day.

## Running Demo Mode

Demo mode refreshes public-safe example outputs from fake data only:

```bash
npm run demo:daily
npm run demo:weekly
```

Demo outputs are written to:

- `examples/demo-daily-checkin.md`
- `examples/demo-weekly-summary.md`

They should always mention fake/sample data and should never be replaced with real generated output.

## Running Inspect

Run:

```bash
npm run inspect
```

Inspect reports whether expected folders and local files exist. It may show safe counts for export files. It does not print private file contents.

## Running Privacy Check

Run:

```bash
npm run privacy:check
```

This checks tracked files and untracked commit candidates for risky paths, raw exports, screenshots, private config, generated output, and secret-like strings.

Also run:

```bash
git status --short --ignored
```

Confirm real local files are ignored before committing.

## Running Tests/Build/Lint

Useful project checks:

```bash
npm run format
npm run build
npm run lint
npm test
```

`npm run lint` currently uses TypeScript `--noEmit` to keep dependencies minimal.

## Recommended Daily Workflow

1. Export Garmin/Strava activities if available.
2. At the end of the day, run `npm run journal` or `npm run journal -- --date YYYY-MM-DD` for the day that just happened.
3. Fill out the journal in under one minute.
4. Run `npm run generate:daily -- --date YYYY-MM-DD` for the next coaching day.
5. Open `output/daily-checkin.md`.
6. Paste the Markdown into ChatGPT that night to plan tomorrow, or the next morning to plan the current day.
7. Review the coaching response and update future journal notes or plan notes if needed.

For example, on the night of June 27, 2026:

```bash
npm run journal -- --date 2026-06-27
npm run generate:daily -- --date 2026-06-28
```

## Recommended Weekly Workflow

1. Make sure the week has daily notes and activities.
2. Add any local exports you want included.
3. Create or update daily journals for the week.
4. Run `npm run parse:exports`.
5. Run `npm run generate:weekly -- --week-start YYYY-MM-DD`.
6. Open `output/weekly-summary.md`.
7. Paste the Markdown into ChatGPT.
8. Review mileage, recovery, duplicate warnings, and next-week recommendations.

## How To Paste Output Into ChatGPT

Open the generated file in `output/`, copy the full Markdown, and paste it into ChatGPT.

Do not paste raw exports unless you intentionally choose to. The generated Markdown is designed to omit raw route points and keep the prompt focused.

## Data Quality Warnings And Duplicate Detection

Manual entries and exports can overlap. For example, a manual row copied from a watch screenshot may describe the same run as a Garmin or Strava export.

The tool compares date, activity type, distance, duration, and start time when available.

High-confidence duplicates are kept internally but one likely duplicate is excluded from daily and weekly totals to reduce double-counting. Uncertain duplicates stay in totals and produce a warning.

The journal template explicitly tells you not to re-enter imported runs, walks, or other exported activities under `Manual Activities`. Use that section only for manual-only activities or imports that are missing or incorrect.

Review data quality warnings before trusting mileage totals.

## Troubleshooting

If `npm install` fails with a certificate error, check your npm registry and certificate settings before changing SSL behavior:

```bash
npm config get registry
npm config get strict-ssl
npm config get cafile
npm config get ca
```

Do not permanently disable SSL verification unless you understand the risk.

If generation says local input files are missing, create a journal with `npm run journal` or copy the legacy CSV templates into the private working filenames listed above.

If weekly generation fails, confirm `--week-start` is a Monday.

If exports do not appear, confirm they are in `input/garmin/` or `input/strava/` and use a supported format.

## Before Publishing To GitHub Checklist

Run:

```bash
npm run format
npm run build
npm run lint
npm test
npm run demo:daily
npm run demo:weekly
npm run privacy:check
git status --short --ignored
```

Then inspect staged files and confirm:

- no private athlete config is tracked
- no real daily journal files are tracked
- no real manual input files are tracked
- no generated `output/` files are tracked
- no raw Garmin/Strava exports are tracked
- no screenshots or activity images are tracked
- examples are fake
- README and docs contain no private details

See [docs/public-github-checklist.md](docs/public-github-checklist.md) for the full checklist.

## Known Limitations

- This is a prompt generator, not a coaching engine.
- FIT parsing is summary-focused and may skip corrupt or unsupported FIT files.
- Export parsing is best-effort and intentionally avoids route-point output.
- Duplicate detection is conservative and may warn instead of merging.
- The privacy check is a guardrail, not a substitute for reviewing staged files.
- Medical concerns should be handled by qualified professionals, not this tool.

## Roadmap/Future Improvements

- Richer validation for manual CSV files.
- Richer validation for parsed local exports.
- Multi-week trend summaries.
- More synthetic end-to-end fixtures.
- Broader FIT message coverage if real-world exports reveal safe summary fields that are currently skipped.
- More detailed setup diagnostics without printing private contents.
