# MCPG Project Status

## Implemented

- Local daily and weekly Markdown check-in generation with shared activity, override, dedupe, and load rules.
- FIT activity parsing; Garmin wellness ZIP support; Garmin sleep CSV support; and Garmin CSV companion handling.
- Mixed inbox ingest with safe classification, journal population, privacy-safe debug, and optional processed-file archive.
- Athlete-local imported-date handling, Garmin/Strava fallback handling, duplicate warnings, and manual journal precedence.
- Tennis, climbing, strength, steps, walking, and running tracked as distinct load categories.
- Manual full-session distance/duration corrections, step provenance selection, weekly labeling/context cleanup, and gait/mild-soreness interpretation.

## Known Limitations

- Export support is best-effort and summary-focused. Corrupt or unsupported FIT layouts, ZIP compression methods, and unsupported file types are skipped safely with warnings.
- There are no Garmin or Strava APIs, OAuth, cloud sync, database, web app, or automatic medical diagnosis.
- Missing or invalid athlete timezone configuration falls back to UTC with a data-quality warning.

## Pending Decisions

- No repository-tracked pending decision is currently documented. Keep future scope decisions privacy-first and verify new export formats before depending on them.

## Current Verification Commands

```bash
npm run format
npm run build
npm run lint
npm test
npm run privacy:check
git diff --check
git status --short
```

For output or ingest changes, also inspect the relevant `coach`, `generate:weekly`, or `ingest` command with `--debug`.

## Recent Architectural Changes

- Mixed inbox ingest became the preferred local workflow, with optional post-success archive.
- Garmin wellness parsing added trusted daily-step selection and sleep CSV support while preserving manual journal values.
- Daily and weekly generation now share manual full-session overrides, duplicate handling, local dates, and clearer load/recovery context.

See [architecture](architecture.md) and [data source priority](data-source-priority.md).
