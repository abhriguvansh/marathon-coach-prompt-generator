# Marathon Coach Prompt Generator

A local TypeScript Node CLI for turning private training notes into clean Markdown prompts that can be pasted into ChatGPT for marathon coaching.

The tool is intentionally local-first. It summarizes evidence so ChatGPT can reason from it; it does not replace ChatGPT as the coach.

## What It Does

- Reads local CSV notes, manual activity summaries, and local export-derived files.
- Keeps running mileage separate from walking and cross-training context.
- Generates coaching-ready Markdown summaries.
- Helps check that private files stay out of Git.
- Parses supported Garmin/Strava local export files without API access.

## What It Does Not Do

- No web app.
- No Strava API, OAuth, tokens, webhooks, or automatic sync.
- No OpenAI API calls.
- No database.
- No diagnosis of injuries.
- No upload of private health, location, or training data.

## Why Not A Web App

This project is designed for private local files. A command-line workflow keeps the first version simpler, easier to audit, and less likely to expose sensitive data.

## Setup

```bash
npm install
npm run inspect
npm run build
npm test
```

## Folder Structure

```txt
config/                 Public example config only
private/                Ignored local athlete config
input/manual/           Public templates and ignored local notes
input/garmin/           Ignored local Garmin exports
input/strava/           Ignored local Strava exports
output/                 Ignored generated summaries
examples/               Fake demo output safe for public GitHub
src/                    CLI source code
tests/                  Unit tests and synthetic fixtures
```

## Local Working Files

Copy templates before entering real data:

```bash
cp input/manual/daily-notes.template.csv input/manual/daily-notes.local.csv
cp input/manual/activity-notes.template.csv input/manual/activity-notes.local.csv
cp input/manual/manual-activities.template.csv input/manual/manual-activities.local.csv
cp input/manual/plan-notes.template.md input/manual/plan-notes.local.md
```

The copied local files are ignored by Git.

## Private Athlete Config

Copy the fake example config:

```bash
cp config/athlete.example.json private/athlete.config.local.json
```

Then edit the private copy with real details. Do not put real athlete or race details in reusable application logic.

## Privacy Checklist

Never commit:

- Real athlete config files.
- Training logs, daily notes, soreness notes, pain notes, or recovery notes.
- Garmin, Strava, phone health, or GPS exports.
- Screenshots of real activities.
- Generated summaries from real data.
- `.env` files, API keys, tokens, secrets, or credentials.

Before publishing or committing, run:

```bash
npm run inspect
npm run privacy:check
git status
```

The inspect command checks for expected local folders and warns not to commit private data. It does not print private file contents. The privacy check scans tracked files and untracked commit candidates for obvious risky paths, filenames, export files, screenshots, and secret-like text. Public docs and tests are allowed to mention warning terms.

## Commands

```bash
npm run generate:daily -- --date 2026-06-27
npm run generate:daily -- --date 2026-06-27 --preview
npm run generate:weekly -- --week-start 2026-06-22
npm run generate:weekly -- --week-start 2026-06-22 --preview
npm run demo:daily
npm run demo:weekly
npm run parse:exports
npm run inspect
npm run build
npm test
npm run lint
npm run format
npm run privacy:check
```

`npm run lint` currently uses the TypeScript compiler with `--noEmit`. This keeps the first version dependency-light while still checking types.

## Daily Check-In Generation

Create private local files first:

```bash
cp config/athlete.example.json private/athlete.config.local.json
cp input/manual/daily-notes.template.csv input/manual/daily-notes.csv
cp input/manual/activity-notes.template.csv input/manual/activity-notes.csv
cp input/manual/manual-activities.template.csv input/manual/manual-activities.csv
cp input/manual/plan-notes.template.md input/manual/plan-notes.md
```

Then edit the private copies with real local data. `npm run generate:daily -- --date YYYY-MM-DD` writes `output/daily-checkin.md`, which is ignored by Git because it may contain private training and recovery information.

The `--date` value is the check-in date. The generator summarizes the previous day's notes and activities as evidence for what to do today. `--preview` prints the generated Markdown summary; it does not print raw input files.

## Weekly Summary Generation

`npm run generate:weekly -- --week-start YYYY-MM-DD` writes `output/weekly-summary.md`, which is ignored by Git because it may contain private training and recovery data.

The `--week-start` value must be a Monday. The weekly summary keeps running mileage separate from walking mileage, treats cross-training and steps as context, and asks ChatGPT to review whether next week's training should progress, hold steady, or back off. `--preview` prints only the generated Markdown summary, not raw private files.

## Local Export Parsing

The tool can scan ignored local export folders and include parsed activity summaries in daily and weekly prompts:

```txt
input/garmin/
input/strava/
```

Supported local formats:

- `.csv`
- `.tcx`
- `.gpx`
- `.json`

FIT parsing is intentionally skipped for now. FIT is a binary format, and this project is staying dependency-light until there is a clear, maintained parser worth adding.

No Garmin API, Strava API, OAuth, cloud sync, or upload is used. Export files can contain sensitive GPS, heart-rate, health, and location data, so real exports must stay in ignored local folders and must never be committed.

Run:

```bash
npm run inspect
npm run parse:exports
```

`inspect` reports safe counts and file-type summaries only. `parse:exports` prints a safe activity summary without raw file contents or route coordinates. Daily and weekly generators merge parsed export activities with manual activities, keeping walking separate from running and treating climbing, tennis, weights, mobility, and steps as context.

## Duplicate Detection

Manual entries and local exports can overlap. For example, a manual row copied from a screenshot may describe the same run as a Garmin or Strava export.

The tool uses conservative duplicate detection across manual, Garmin export, and Strava export activities. It compares calendar date, normalized activity type, distance, duration, and start time when available.

High-confidence duplicates are kept internally but one likely duplicate is excluded from daily and weekly mileage/duration totals to reduce double-counting. Uncertain matches stay in totals and produce a warning instead of being merged. Duplicate detection is not perfect, so review data quality warnings before trusting mileage totals.

## Demo Mode

Demo mode refreshes public-safe sample outputs from committed fake data only:

```bash
npm run demo:daily
npm run demo:weekly
```

These commands write:

- `examples/demo-daily-checkin.md`
- `examples/demo-weekly-summary.md`

Demo outputs use fake details such as Sample Runner and Example City Marathon. They are safe to commit. Real generated outputs remain ignored under `output/`, and real local inputs remain ignored under `input/`.

## Known Limitations

- Prompt generation is not implemented yet.
- FIT export parsing is not implemented yet.
- Export parsing is best-effort and intentionally avoids route-point output.
- Daily check-in generation currently uses manual CSV/Markdown files plus best-effort local export summaries.
- Weekly summary generation currently uses manual CSV/Markdown files plus best-effort local export summaries.

## Planned Next Sessions

- Add richer validation for manual CSV files.
- Add richer validation for parsed local exports.
- Add multi-week trend summaries.
- Add more synthetic fixtures for end-to-end prompt generation.
