# Weekly Workflow

Use weekly planning when you want ChatGPT to adjust the upcoming training week from recent evidence.

Recommended timing:

- Sunday night
- Monday morning

Run:

```bash
npm run coach:weekly
```

This chooses the next Monday as the planning week start.

Definitions:

- Week start: first day of the planning week.
- Week end: week start plus 6 days.
- Evidence window: the 7 days immediately before week start.

For an explicit planning week:

```bash
npm run generate:weekly -- --week-start YYYY-MM-DD
```

The generated prompt is written to:

```txt
output/weekly-checkin.md
```

Weekly output is compact by default. It summarizes recent running, walking, cross-training, recovery, load/risk flags, upcoming constraints, and the current plan context. It does not include raw route data, GPS coordinates, raw exports, or full journal contents.
