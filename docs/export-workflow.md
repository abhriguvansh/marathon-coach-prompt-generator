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

- `.fit`
- `.csv`
- `.tcx`
- `.gpx`
- `.json`

Prefer FIT, TCX, or CSV exports when available because they usually carry better activity summary data than GPX. GPX is still useful as a fallback when summary exports are not available.

FIT parsing is local and summary-focused. It reads fields such as date, activity type, distance, elapsed time, moving time, pace, speed, elevation gain/loss, heart rate, cadence, calories, training effect, temperature, device labels, and lap/split summaries when present. It does not print raw binary contents, route points, or coordinates. Corrupt or unsupported FIT files produce a warning and are skipped.

Activity dates are assigned using the athlete-local IANA timezone in `private/athlete.config.local.json`, for example `America/New_York`. FIT, TCX, GPX, and JSON timestamps may be stored in UTC, so a local late-evening activity can appear as the next UTC day in the file. MCPG converts the timestamp to the configured timezone and uses that local calendar date for journals, daily check-ins, weekly grouping, recent context, and duplicate detection. VPN location, download time, and filesystem modified time are not used.

If timezone is missing or invalid, export parsing falls back to UTC and reports a concise data-quality warning.

## Safe Export Inspection

Run:

```bash
npm run parse:exports
```

The command prints safe counts, activity-type summaries, and parse warnings. It does not print raw file contents, raw FIT binary data, coordinates, or raw GPS route points.

## Daily And Weekly Generation

Daily and weekly generators include parsed export activity summaries automatically:

```bash
npm run generate:daily -- --date YYYY-MM-DD
npm run generate:weekly -- --week-start YYYY-MM-DD
```

The journal command also uses exports to prefill the read-only imported activity reference section:

```bash
npm run journal -- --date YYYY-MM-DD
```

That journal date is the completed evidence day. For next-day coaching, generate the daily check-in with the following day as the coaching date:

```bash
npm run journal -- --date 2026-06-27
npm run generate:daily -- --date 2026-06-28
```

Manual activities and exports may overlap. Review data quality warnings before trusting totals.

Existing journals are not overwritten automatically. If an older journal was created before correcting exports or timezone config, regenerate or manually refresh it to update the imported activity references.

## Duplicate Detection

The tool compares date, activity type, distance, duration, and start time when available.

High-confidence duplicates may be excluded from daily and weekly totals to avoid double-counting. Uncertain duplicates stay in totals and produce warnings.

Do not manually re-enter imported runs, walks, or other exported activities in the daily journal unless the import is missing or incorrect.

## Before Committing

Run:

```bash
npm run privacy:check
git status --short --ignored
```

Confirm real exports, screenshots, generated summaries, and private local files are not commit candidates.
