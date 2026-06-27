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
- Reads private manual notes from `input/manual/`.
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
- No FIT parsing yet.
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
Copy-Item input/manual/daily-notes.template.csv input/manual/daily-notes.csv
Copy-Item input/manual/activity-notes.template.csv input/manual/activity-notes.csv
Copy-Item input/manual/manual-activities.template.csv input/manual/manual-activities.csv
Copy-Item input/manual/plan-notes.template.md input/manual/plan-notes.md
```

macOS/Linux shell:

```bash
cp config/athlete.example.json private/athlete.config.local.json
cp input/manual/daily-notes.template.csv input/manual/daily-notes.csv
cp input/manual/activity-notes.template.csv input/manual/activity-notes.csv
cp input/manual/manual-activities.template.csv input/manual/manual-activities.csv
cp input/manual/plan-notes.template.md input/manual/plan-notes.md
```

Then run:

```bash
npm run inspect
```

## Creating Private Athlete Config

Edit `private/athlete.config.local.json` with your real local race and training context. This file is ignored by Git.

Keep public config files fake. Do not put real athlete names, real race logistics, private travel, or health details in `config/athlete.example.json`.

## Copying Manual Note Templates

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

Use `daily-notes.csv` for date-level recovery and readiness context: soreness, pain, gait changes, fatigue, energy, sleep, stress, motivation, steps, and short notes.

Use one row per day. Keep notes concise enough that the generated prompt remains readable.

## Filling In Activity Notes

Use `activity-notes.csv` for notes about activities already represented elsewhere, such as gear, fueling, terrain, perceived effort, or anything you want the coaching prompt to know.

This file is useful when an export has numbers but not enough context.

## Filling In Manual Activities

Use `manual-activities.csv` for activities you enter yourself: runs, walks, strength, climbing, tennis, mobility, rest, and other training context.

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

- `.csv`
- `.tcx`
- `.gpx`
- `.json`

Run:

```bash
npm run parse:exports
```

The command prints safe counts and summaries. It does not print raw route points or raw private file contents.

## FIT Limitation

FIT files are detected and reported as unsupported, but they are not parsed yet. FIT is a binary format, and this project is staying dependency-light until a parser is added deliberately.

## Generating Daily Check-In

Run:

```bash
npm run generate:daily -- --date YYYY-MM-DD
```

Example:

```bash
npm run generate:daily -- --date 2026-06-27
```

This writes:

```txt
output/daily-checkin.md
```

The `--date` is the check-in date. The generator uses the previous day as evidence for what to ask ChatGPT about today.

To print the generated Markdown to the terminal:

```bash
npm run generate:daily -- --date 2026-06-27 --preview
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

1. Update `input/manual/daily-notes.csv`.
2. Add or update any relevant manual activities.
3. Optionally add local Garmin/Strava exports.
4. Run `npm run inspect`.
5. Run `npm run generate:daily -- --date YYYY-MM-DD`.
6. Open `output/daily-checkin.md`.
7. Paste the Markdown into ChatGPT.
8. Review the coaching response and update `input/manual/plan-notes.md` if needed.

## Recommended Weekly Workflow

1. Make sure the week has daily notes and activities.
2. Add any local exports you want included.
3. Run `npm run parse:exports`.
4. Run `npm run generate:weekly -- --week-start YYYY-MM-DD`.
5. Open `output/weekly-summary.md`.
6. Paste the Markdown into ChatGPT.
7. Review mileage, recovery, duplicate warnings, and next-week recommendations.

## How To Paste Output Into ChatGPT

Open the generated file in `output/`, copy the full Markdown, and paste it into ChatGPT.

Do not paste raw exports unless you intentionally choose to. The generated Markdown is designed to omit raw route points and keep the prompt focused.

## Data Quality Warnings And Duplicate Detection

Manual entries and exports can overlap. For example, a manual row copied from a watch screenshot may describe the same run as a Garmin or Strava export.

The tool compares date, activity type, distance, duration, and start time when available.

High-confidence duplicates are kept internally but one likely duplicate is excluded from daily and weekly totals to reduce double-counting. Uncertain duplicates stay in totals and produce a warning.

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

If generation says local input files are missing, copy the templates into the private working filenames listed above.

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
- no real manual input files are tracked
- no generated `output/` files are tracked
- no raw Garmin/Strava exports are tracked
- no screenshots or activity images are tracked
- examples are fake
- README and docs contain no private details

See [docs/public-github-checklist.md](docs/public-github-checklist.md) for the full checklist.

## Known Limitations

- This is a prompt generator, not a coaching engine.
- FIT parsing is not implemented.
- Export parsing is best-effort and intentionally avoids route-point output.
- Duplicate detection is conservative and may warn instead of merging.
- The privacy check is a guardrail, not a substitute for reviewing staged files.
- Medical concerns should be handled by qualified professionals, not this tool.

## Roadmap/Future Improvements

- Richer validation for manual CSV files.
- Richer validation for parsed local exports.
- Multi-week trend summaries.
- More synthetic end-to-end fixtures.
- Optional FIT support if a safe, maintained parser is chosen.
- More detailed setup diagnostics without printing private contents.
