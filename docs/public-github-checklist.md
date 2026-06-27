# Public GitHub Checklist

Use this checklist before publishing the repository, pushing a branch, or opening a pull request.

## 1. Run Project Checks

- Run `npm run format`.
- Run `npm run build`.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run demo:daily`.
- Run `npm run demo:weekly`.
- Run `npm run privacy:check`.
- Run `npm run inspect`.
- Run `npm run parse:exports`.

## 2. Inspect Git State

- Run `git status --short --ignored`.
- Inspect staged files before committing.
- Confirm `node_modules/` is ignored.
- Confirm `dist/` is ignored.
- Confirm generated files under `output/` are ignored.

## 3. Confirm Private Files Are Not Tracked

- Confirm no private athlete config is tracked.
- Confirm no real `input/manual/` working files are tracked.
- Confirm no generated `output/` files are tracked.
- Confirm no Garmin exports are tracked.
- Confirm no Strava exports are tracked.
- Confirm no `.fit`, `.tcx`, `.gpx`, or real export `.json` files are tracked outside synthetic fixtures.
- Confirm no screenshots or activity images are tracked.
- Confirm no `.env` files are tracked.
- Confirm no API keys, tokens, client secrets, refresh tokens, or credentials are tracked.

## 4. Confirm Public Files Are Safe

- Confirm `config/athlete.example.json` uses fake data only.
- Confirm templates in `input/manual/` use fake/demo rows only.
- Confirm `examples/demo-daily-checkin.md` says it is fake public-safe output.
- Confirm `examples/demo-weekly-summary.md` says it is fake public-safe output.
- Confirm tests use synthetic fixtures only.
- Confirm README and docs do not include real athlete, race, travel, health, GPS, or schedule details.

## 5. Commit Only Public-Safe Files

Public-safe commit candidates include:

- source code
- package files
- docs
- fake examples
- templates
- synthetic tests and fixtures
- `.gitkeep` placeholders

Do not commit private local data, raw exports, generated private summaries, screenshots, or secrets.
