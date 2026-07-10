# MCPG Agent Guide

## Purpose

MCPG is a local, privacy-first CLI that turns athlete journals and local Garmin/Strava exports into daily and weekly Markdown coaching prompts. It does not provide coaching, cloud sync, or external API access.

## Workflow and verification

Keep a change focused. Before handing off a code or documentation change, run the relevant checks:

```bash
npm run format
npm run build
npm run lint
npm test
npm run privacy:check
git diff --check
git status --short
```

For user-facing generation or ingest work, also inspect real safe output as applicable:

```bash
npm run coach -- --evidence-date YYYY-MM-DD --debug
npm run generate:weekly -- --week-start YYYY-MM-DD --debug
npm run ingest -- --date YYYY-MM-DD --debug
```

Rendered output must be inspected for user-facing changes; tests alone are insufficient for output-format work.

## Data, dates, and parity

- Source authority is: direct athlete report > manual journal > trusted import > inferred/default. Do not silently blend conflicts.
- Use the configured athlete-local IANA timezone for imported timestamp dates. UTC is only the warned fallback for missing or invalid configuration.
- The daily evidence day is the completed day; coaching day is the adjacent next day. Weekly evidence is the seven days before the Monday planning week.
- Preserve daily/weekly parity: both must use the same resolved activities, manual full-session overrides, dedupe behavior, classifications, and canonical daily values.
- Keep manual journal values. A full-session distance/duration correction replaces only those recorded metrics while retaining device metrics for the recorded portion. Direct athlete activity/type classification wins over an ambiguous device profile.
- High-confidence cross-source duplicates count once; uncertain matches remain visible and warn. Never count the same Garmin and Strava activity twice.

## Privacy and commit safety

- Never commit private journals, exports, generated output, local config, inbox data, or processed data.
- Normal and debug output must not expose GPS/route points, raw FIT data, device identifiers, or secrets.
- When touching ignore/privacy behavior, verify against real ignored-data state with `git status --short --ignored` as well as `npm run privacy:check`.
- Review the exact diff and staged paths. Do not add unrelated or private files.

## Task discipline

Use one Codex thread for one distinct feature or bug. Reuse a thread only for a direct follow-up to that implementation; start a new thread for unrelated work.

See [architecture](docs/architecture.md), [source priority](docs/data-source-priority.md), and [domain rules](docs/coaching-domain-rules.md).
