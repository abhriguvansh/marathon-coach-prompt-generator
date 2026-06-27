import {
  parseLocalExports,
  summarizeExportScan,
} from "../exports/export-scanner";

if (require.main === module) {
  const result = parseLocalExports(process.cwd());
  const bySource = new Map<string, number>();
  const byType = new Map<string, number>();

  for (const activity of result.activities) {
    bySource.set(activity.source, (bySource.get(activity.source) ?? 0) + 1);
    byType.set(
      activity.activityType,
      (byType.get(activity.activityType) ?? 0) + 1,
    );
  }

  console.log("Local Export Parse Summary");
  console.log("");
  console.log(summarizeExportScan(result.scan));
  console.log(`Parsed activities: ${result.activities.length}`);
  console.log(`Activities by source: ${formatMap(bySource)}`);
  console.log(`Activities by type: ${formatMap(byType)}`);
  console.log(`Parse warnings: ${result.warnings.length}`);

  for (const warning of result.warnings) {
    console.log(`- ${warning.message}`);
  }

  console.log("");
  console.log(
    "Route points and GPS coordinates are omitted from this summary.",
  );
}

function formatMap(values: Map<string, number>): string {
  if (values.size === 0) {
    return "none";
  }

  return [...values.entries()]
    .map(([key, count]) => `${key}: ${count}`)
    .join(", ");
}
