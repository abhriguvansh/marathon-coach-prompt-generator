# MCPG Architecture

MCPG is a local TypeScript CLI. It reads ignored athlete data, resolves it into canonical daily evidence, and renders Markdown prompts without exposing raw export contents.

## Pipeline

```text
files/inbox
  -> classification
  -> source parsers
  -> athlete-local date assignment
  -> safe journal population
  -> journal reload
  -> source-priority resolution
  -> canonical daily summary
  -> daily/weekly rendering
```

`input/inbox/` is the normal mixed drop zone. `src/ingest/inbox.ts` classifies FIT activity and wellness content, Garmin sleep CSV, Garmin CSV companions, and Strava-style GPX, TCX, CSV, and JSON exports. The older `input/garmin/` and `input/strava/` roots remain supported; `input/processed/` is also scanned after an optional archive.

`src/exports/export-scanner.ts` dispatches supported activity formats to the parsers. FIT content is classified before parsing: activity FIT is Garmin-primary, while wellness FIT is sent to `src/garmin-wellness/`. GPX, TCX, and JSON inbox files are treated as Strava fallback exports. Garmin wellness ZIP parsing and Garmin sleep CSV parsing produce aggregate recovery fields, not raw records.

## Dates, journals, and imports

Embedded timestamps are assigned to the configured athlete-local IANA timezone by `src/utils/timezone.ts`; filesystem/download time and filename are not authoritative. Missing or invalid timezone configuration falls back to UTC with a warning. Wellness selection is for the requested local date, with sleep assigned from its local wake date.

`src/garmin-wellness/importer.ts` and `journal-updater.ts` create or refresh the date journal and populate only safe blank structured fields. Existing manual journal values are preserved, including conflicting manual steps. `src/parsers/journal.ts` reloads journals, merges journal notes over legacy CSV notes, refreshes imported-activity reference text, and parses manual-only activities.

Journal full-session distance or duration corrections are applied by `src/generator/activity-overrides.ts`: corrected totals replace the recorded portion while other device metrics remain attached to that activity. Journal activity headings provide the manual type correction path for ambiguous device profiles.

## Canonical summaries and output

`src/generator/daily-summary.ts` creates the daily summary for the preceding evidence day. `src/generator/weekly-summary.ts` uses the seven completed evidence days before the Monday planning week. Both apply full-session overrides, activity classification, and `src/generator/duplicate-detection.ts` before totaling activity. High-confidence duplicates are counted once; uncertain matches remain with a warning. Garmin takes precedence over Strava among equivalent imported activity records, while manual corrections remain authoritative.

Running, walking, climbing, tennis, strength, mobility, and other load are grouped separately by `src/generator/activity-classification.ts`. Weekly totals are built from the same resolved canonical daily values and activity rules as daily output, so the two views must agree. Missing data is not converted into rest or recovery.

`src/generator/daily-markdown.ts` and `weekly-markdown.ts` render the prompts. Debug output reports concise provenance, source categories, selected dates, overrides, and dedupe decisions; it intentionally omits raw FIT/ZIP contents, route points, and identifiers. See [data source priority](data-source-priority.md).

## Archive behavior

Ingest is non-destructive by default. With `--archive`, `src/ingest/inbox.ts` moves only successfully processed supported inbox files to `input/processed/YYYY-MM-DD/`; unsupported or unsuccessfully inspected/parsed files stay in the inbox, and warnings skip archive.
