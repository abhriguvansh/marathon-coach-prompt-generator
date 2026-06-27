# Public GitHub Checklist

Use this checklist before publishing or pushing changes publicly.

## Verify The Project

- Run `npm run format`.
- Run `npm run build`.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run demo:daily`.
- Run `npm run demo:weekly`.
- Run `npm run privacy:check`.
- Run `npm run inspect`.

## Inspect Git State

- Run `git status --short --ignored`.
- Inspect staged files before committing.
- Confirm `node_modules/` and `dist/` are ignored.
- Confirm demo files in `examples/` use fake data only.

## Keep Private Data Out

- Ensure no private athlete config is committed.
- Ensure no real `input/manual/` files are committed.
- Ensure no generated private `output/` files are committed.
- Ensure no Garmin or Strava exports are committed.
- Ensure no screenshots or activity images are committed.
- Ensure no `.env` files, access tokens, refresh tokens, client secrets, or credentials are committed.

## Public-Safe Files

- Templates under `input/manual/*.template.csv` and `input/manual/*.template.md` are public-safe.
- `.gitkeep` placeholders are public-safe.
- Demo outputs under `examples/` are public-safe only when generated from fake demo data.
