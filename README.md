# Marathon Coach Prompt Generator

A local TypeScript Node CLI for turning private training notes into clean Markdown prompts that can be pasted into ChatGPT for marathon coaching.

The tool is intentionally local-first. It summarizes evidence so ChatGPT can reason from it; it does not replace ChatGPT as the coach.

## What It Does

- Reads local CSV notes, manual activity summaries, and local export-derived files.
- Keeps running mileage separate from walking and cross-training context.
- Generates coaching-ready Markdown summaries.
- Helps check that private files stay out of Git.

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
- Garmin and Strava local export parsing is not implemented yet.
- Garmin and Strava export parsing will be local-only when added. It will not require Strava API access, OAuth, tokens, or automatic sync.
- Daily check-in generation currently uses manually prepared local CSV and Markdown files only.
- Weekly summary generation currently uses manually prepared local CSV and Markdown files only.

## Planned Next Sessions

- Add local Garmin/Strava export parsing without API access.
- Add richer validation for manual CSV files.
- Add multi-week trend summaries.
- Add more synthetic fixtures for end-to-end prompt generation.
