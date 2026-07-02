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
- Reads Garmin wellness ZIP exports from ignored local folders and fills blank journal wellness fields.
- Keeps running mileage separate from walking mileage.
- Treats cross-training, steps, climbing, weights, tennis, and mobility as context, not running mileage.
- Adds compact recent coaching context to daily check-ins from the last 7-14 days of local journals and parsed activities.
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
- No raw Garmin wellness ZIP or FIT output.
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
npm run coach:tonight
```

macOS/Linux shell:

```bash
cp config/athlete.example.json private/athlete.config.local.json
npm run coach:tonight
```

Then run:

```bash
npm run inspect
```

## Creating Private Athlete Config

Edit `private/athlete.config.local.json` with your real local race and training context. This file is ignored by Git.

Set `timezone` to your athlete-local IANA timezone, such as `America/New_York`. Imported activity timestamps, including FIT timestamps stored in UTC, are grouped by this athlete-local calendar date before daily journals, daily check-ins, weekly summaries, recent context, and duplicate detection use them. If the timezone is missing or invalid, MCPG falls back to UTC and prints a concise data-quality warning.

Keep public config files fake. Do not put real athlete names, real race logistics, private travel, or health details in `config/athlete.example.json`.

## Daily Coaching Workflow

Use the one-command coach workflow for normal daily use. It prints the evidence date and coaching date before doing work. Daily check-ins are compact by default, so they keep the race header and omit the full `## Athlete Background` section.

Night workflow:

```bash
npm run coach:tonight
```

This uses today as the completed evidence day and tomorrow as the coaching day. It creates or reuses `input/journal/YYYY-MM-DD.md`, then generates `output/daily-checkin.md`.

Morning workflow:

```bash
npm run coach:morning
```

This uses yesterday as the completed evidence day and today as the coaching day.

Explicit catch-up workflow:

```bash
npm run coach -- --evidence-date YYYY-MM-DD
```

You can also provide the coaching day directly:

```bash
npm run coach -- --coaching-date YYYY-MM-DD
```

If the command creates or reuses a journal, add subjective details such as soreness, pain, steps, energy, shoes, and tomorrow constraints. Then rerun the same command to regenerate the check-in.

The coach workflow automatically runs a check-in completeness validator. It warns about missing subjective details that exports cannot know, such as soreness, pain, gait changes, energy, steps, shoes, fueling, and tomorrow constraints. These warnings do not block generation.

Daily check-ins also include a compact `## Recent Coaching Context` section. It summarizes recent running volume, walking volume, high-step days, cross-training, recovery trend, and the last run when available. Steps are treated as load context only; they are never counted as walking mileage. Raw route data and export contents are omitted.

Daily check-ins include `## Recovery Trend Flags` after recent context. These flags summarize recent soreness, pain, gait, and load/recovery patterns from local journals. Missing data is not assumed to mean pain-free, gait changes are treated as high-priority safety context, and worsening pain or soreness should be reviewed conservatively by the coach. These flags are coaching context only, not a medical diagnosis.

To run the validator by itself:

```bash
npm run validate:checkin -- --evidence-date YYYY-MM-DD
```

For a standalone check-in or a new ChatGPT coaching thread, include the full background explicitly:

```bash
npm run coach -- --evidence-date YYYY-MM-DD --include-athlete-background
```

## Creating Daily Journals Manually

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

Enter daily steps in the Recovery section when you have them:

```md
Total Steps: 11k
```

Step counts are training-load context only. They are not converted to miles and are not counted as walking mileage. Walking mileage comes only from tracked/imported walking activities or explicit manual walk distance entries. Future supported device daily-step exports may be preferred when available, with manual journal steps remaining useful fallback context.

For planned run/walk workouts, put the structure in the export activity description when available, or use the journal fallback:

```md
Workout Structure: 2.5 min walk warmup + 4/1 run walk + 5 min walk cooldown
```

The generated check-in uses this only to interpret pacing context, such as planned walk breaks and cooldowns. It does not judge the workout from split variability alone, and it does not convert run/walk walk breaks into separate walking mileage.

The same field can also carry lightweight structure labels for future workouts:

```text
Easy run/walk 4/1 + 4 x 20 sec relaxed strides
Long run/walk 4/1, easy effort, fueling practice
3 mi easy + 2 mi marathon effort
```

MCPG summarizes these as context only. It does not prescribe workouts, enforce targets, or judge performance from the label.

Manual end-of-day flow:

```bash
npm run journal -- --date 2026-06-27
npm run generate:daily -- --date 2026-06-28
```

That creates/fills the journal for June 27, 2026, then generates the coaching check-in for June 28, 2026. You can paste the output into ChatGPT on the night of June 27 to plan tomorrow, or on the morning of June 28 to plan the current day.

The daily check-in uses June 27 as the evidence day and also looks back from that evidence day for recent coaching context. The last 7 days are June 21 through June 27 inclusive, and the last 14 days are June 14 through June 27 inclusive.

Daily check-ins include a compact day type/load classification, such as `run day`, `high-step no-run day`, `climbing day`, or `mixed-load day`. This is coaching context only, not a medical diagnosis or scientific fatigue score. Steps are load context, not walking mileage, and missing data is not treated as rest.

Recovery trend confidence depends on journal coverage. If only one recent entry has soreness or pain data, MCPG reports limited context rather than inventing a trend.

Real daily journals are ignored by Git. Only `input/journal/template.md` is committed.

Existing journals are not overwritten automatically. If you created a journal before adding or correcting exports or timezone configuration, regenerate or refresh that journal yourself to update the imported-activity reference section.

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

Use `Total Steps:` in the journal for manual daily step counts. Compact entries like `11k`, `11,000`, or `about 11k` are accepted for load context.

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

Activity dates come from the embedded activity timestamp, converted to the configured athlete timezone. A late-evening local activity can appear as the next day in UTC inside FIT, TCX, GPX, or JSON exports; MCPG assigns it to the local evidence date. VPN location, file download time, and filesystem timestamps are not used as activity dates.

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

For Strava or Garmin exports that preserve an activity description or notes field, a concise run/walk structure such as `2.5 min walk warmup + 4/1 run walk + 5 min walk cooldown` can be detected and rendered as coaching context. If the export does not include that text, add the same structure to the evidence-day journal's `Workout Structure:` field.

Lightweight labels such as `easy run`, `recovery run`, `long run/walk`, `4 x 20 sec strides`, `tempo`, `marathon effort`, and `progression run` may also be detected when they appear in the description or journal field. These labels are used only to help ChatGPT interpret the workout structure.

## Garmin Wellness ZIPs

Garmin wellness ZIP ingestion is local-only and optional. Put real wellness exports in either location:

```txt
input/garmin/
input/garmin/wellness/
```

Supported forms include:

```txt
input/garmin/2026-07-01.zip
input/garmin/wellness/2026-07-01.zip
input/garmin/wellness/garmin-wellness-2026-07-01.zip
input/garmin/wellness/2026-07-01/*.fit
```

Run:

```bash
npm run import:wellness -- --date 2026-07-01
```

The importer opens ZIPs directly, decodes `.fit` files inside, ignores non-FIT entries, rejects unsafe archive paths, and updates only blank or missing structured journal fields for the requested athlete-local date. Manual journal values are preserved. Subjective soreness, pain, gait, energy, fatigue, motivation, and subjective stress remain manual.

Garmin stress is stored separately as `Garmin Stress:` because it is a device metric, not the same scale as subjective `Stress (0-10 or words):`.

The coach workflow also runs wellness import for the evidence day before validation and daily generation.

## Generating Daily Check-In Manually

Run:

```bash
npm run generate:daily -- --date YYYY-MM-DD
```

`npm run generate:daily -- --date YYYY-MM-DD` means: generate the coaching check-in for that coaching day. The daily generator uses the previous day as evidence.

The generated daily prompt includes a compact recent-context section after mileage and load. Review it before pasting into ChatGPT, especially when recent journals are missing or manual entries may overlap imported Garmin/Strava exports.

Daily output is compact by default and omits the full `## Athlete Background` section. Use this when the ongoing coaching thread already knows your background.

Manual example:

```bash
npm run journal -- --date 2026-06-27
npm run generate:daily -- --date 2026-06-28
```

This writes:

```txt
output/daily-checkin.md
```

This uses the June 27 journal/export data as evidence and writes a June 28 coaching check-in. The output can be pasted into ChatGPT on the night of June 27 or the morning of June 28.

For standalone/full context:

```bash
npm run generate:daily -- --date 2026-06-28 --include-athlete-background
```

To print the generated Markdown to the terminal:

```bash
npm run generate:daily -- --date 2026-06-28 --preview
```

## Generating Weekly Summary

Run:

```bash
npm run generate:weekly -- --week-start YYYY-MM-DD
```

The week start is the first day of the planning week and must be a Monday. The evidence window is the 7 days immediately before that week start.

For normal Sunday-night or Monday-morning planning:

```bash
npm run coach:weekly
```

Example:

```bash
npm run generate:weekly -- --week-start 2026-06-29
```

This writes:

```txt
output/weekly-checkin.md
```

To print the generated Markdown to the terminal:

```bash
npm run generate:weekly -- --week-start 2026-06-29 --preview
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

## Cleaning Up Old Local Files

Cleanup is dry-run by default and only targets old local exports and generated outputs:

```bash
npm run cleanup -- --dry-run
```

To delete eligible untracked files older than 14 days:

```bash
npm run cleanup -- --yes
```

To choose a different retention window:

```bash
npm run cleanup -- --older-than-days 14 --dry-run
```

Journals and manual notes are kept by default. Only clean journals when you explicitly ask for it:

```bash
npm run cleanup -- --include-journals --older-than-days 90 --dry-run
```

Cleanup never deletes tracked files, `.gitkeep` files, private config, manual notes, templates, docs, source, tests, or package files. It prints relative paths, counts, and approximate sizes only.

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
2. Place a Garmin wellness ZIP in `input/garmin/wellness/` if available.
3. At night, run `npm run coach:tonight`.
4. Fill out the evidence-day journal if the command created or if the validator warns about missing subjective details.
5. Rerun `npm run coach:tonight` to regenerate the check-in with your subjective notes.
6. Open `output/daily-checkin.md`.
7. Paste the Markdown into ChatGPT that night to plan tomorrow, or the next morning to plan the current day.
8. Review the coaching response and update future journal notes or plan notes if needed.

For example, on the night of June 27, 2026:

```bash
npm run coach:tonight
```

If you missed the night check-in, run `npm run coach:morning` the next morning. When catching up or regenerating a specific day, run `npm run coach -- --evidence-date YYYY-MM-DD`.

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
