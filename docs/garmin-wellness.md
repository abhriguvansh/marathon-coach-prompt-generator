# Garmin Wellness ZIP Workflow

Garmin wellness import is local-only. It does not use Garmin API access, OAuth, cloud sync, or external services.

## Where Files Go

Put real wellness exports in either location:

```txt
input/garmin/
input/garmin/wellness/
```

Supported forms:

```txt
input/garmin/2026-07-01.zip
input/garmin/wellness/2026-07-01.zip
input/garmin/wellness/garmin-wellness-2026-07-01.zip
input/garmin/wellness/2026-07-01/*.fit
```

Direct ZIP parsing is supported. Manual extraction is not required.

## Import Command

Run:

```bash
npm run import:wellness -- --date 2026-07-01
```

The command finds Garmin wellness ZIP/FIT files, decodes `.fit` entries, groups records by the configured athlete-local timezone, and updates the matching daily journal.

## Journal Fields

Garmin may populate blank or missing structured fields:

- `Total Steps:`
- `Sleep Duration:`
- `Sleep Score:`
- `Resting Heart Rate:`
- `Overnight HRV:`
- `HRV Status:`
- `Garmin Stress:`
- `Body Battery:`

Manual values win. Existing nonblank journal values are preserved.

Subjective fields remain manual:

- soreness
- pain
- pain location/type
- gait change
- energy
- fatigue
- motivation
- subjective `Stress (0-10 or words):`

Garmin stress is stored as `Garmin Stress:` because it is a device metric, not the same thing as subjective stress.

## Coach Workflow

The daily coach workflow runs wellness import for the evidence day:

```bash
npm run coach:tonight
npm run coach:morning
npm run coach -- --evidence-date YYYY-MM-DD
```

If no wellness file exists for the date, generation continues normally.

## Date Handling

Wellness records are assigned using the configured IANA timezone, such as `America/New_York`.

Embedded FIT timestamps may be UTC. A record at `2026-07-02T02:15:00Z` can belong to local evidence date `2026-07-01`.

MCPG does not use ZIP filename, download time, file modified time, VPN location, or machine-local timezone as the authoritative wellness date.

## Privacy

The importer does not print raw FIT messages, raw ZIP contents, device serial numbers, user IDs, account IDs, raw minute-by-minute logs, or private config contents.

Generated daily and weekly output shows aggregate wellness context only.

Real wellness ZIPs and FIT files remain ignored by Git.

## Limitations

Garmin devices may export different FIT message layouts. Unsupported records are ignored safely. Corrupt FIT files are skipped with a concise warning while usable files continue to import.
