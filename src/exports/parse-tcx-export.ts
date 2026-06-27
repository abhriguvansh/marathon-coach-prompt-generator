import type {
  ExportParseWarning,
  ExportSource,
  ManualActivity,
} from "../types";
import {
  allTagBlocks,
  buildExportActivity,
  dateFromDateTime,
  metersValueToFeet,
  metersValueToMiles,
  parseNumber,
  secondsValueToMinutes,
  textBetween,
  warning,
} from "./parse-helpers";

export function parseTcxExport(content: string, source: ExportSource) {
  const activities: ManualActivity[] = [];
  const warnings: ExportParseWarning[] = [];
  const blocks = allTagBlocks(content, "Activity");

  if (blocks.length === 0) {
    return {
      activities,
      warnings: [
        warning(source, "TCX export contained no Activity blocks.", ".tcx"),
      ],
    };
  }

  blocks.forEach((block, index) => {
    const activity = buildExportActivity({
      source,
      activityType: activityTypeFromTcx(block),
      startDate: dateFromDateTime(
        textBetween(block, "Id") ?? textBetween(block, "Time"),
      ),
      distanceMiles: metersValueToMiles(textBetween(block, "DistanceMeters")),
      durationMinutes: secondsValueToMinutes(
        textBetween(block, "TotalTimeSeconds"),
      ),
      elevationFt: metersValueToFeet(textBetween(block, "ElevationGainMeters")),
      avgHr: parseNumber(
        textBetween(textBetween(block, "AverageHeartRateBpm") ?? "", "Value"),
      ),
      maxHr: parseNumber(
        textBetween(textBetween(block, "MaximumHeartRateBpm") ?? "", "Value"),
      ),
    });

    if (!activity) {
      warnings.push(
        warning(
          source,
          `TCX activity ${index + 1} skipped because no start date was found.`,
          ".tcx",
        ),
      );
      return;
    }

    activities.push(activity);
  });

  return { activities, warnings };
}

function activityTypeFromTcx(block: string): string | null {
  const match = block.match(/<[^:>]*:?Activity[^>]*Sport="([^"]+)"/i);

  return match?.[1] ?? null;
}
