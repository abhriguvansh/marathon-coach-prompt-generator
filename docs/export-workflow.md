# Local Export Workflow

Use local exports when you want Garmin or Strava activity files included without using any API, OAuth, sync, or cloud integration.

## Where Exports Go

Put real exports in ignored folders:

```txt
input/garmin/
input/strava/
```

Do not put real exports in `examples/`, `tests/`, or docs.

## Sensitive Data Warning

Exports may contain:

- GPS and route details
- heart rate
- activity times
- health and recovery signals
- private locations
- travel patterns

These files should stay local and ignored.

## Supported Formats

Best-effort parsing is available for:

- `.csv`
- `.tcx`
- `.gpx`
- `.json`

FIT files are detected and warned about, but not parsed.

## Safe Export Inspection

Run:

```bash
npm run parse:exports
```

The command prints safe counts, activity-type summaries, and parse warnings. It does not print raw file contents or raw GPS route points.

## Daily And Weekly Generation

Daily and weekly generators include parsed export activity summaries automatically:

```bash
npm run generate:daily -- --date YYYY-MM-DD
npm run generate:weekly -- --week-start YYYY-MM-DD
```

Manual activities and exports may overlap. Review data quality warnings before trusting totals.

## Duplicate Detection

The tool compares date, activity type, distance, duration, and start time when available.

High-confidence duplicates may be excluded from daily and weekly totals to avoid double-counting. Uncertain duplicates stay in totals and produce warnings.

## Before Committing

Run:

```bash
npm run privacy:check
git status --short --ignored
```

Confirm real exports, screenshots, generated summaries, and private local files are not commit candidates.
