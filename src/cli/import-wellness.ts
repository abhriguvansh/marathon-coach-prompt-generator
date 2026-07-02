import { loadAthleteConfig } from "../config/load";
import {
  formatGarminWellnessImportReport,
  importGarminWellness,
} from "../garmin-wellness/importer";
import { parseDate } from "../utils/dates";

interface Args {
  date: string | null;
  debug: boolean;
}

export function parseImportWellnessArgs(argv: string[]): Args {
  let date: string | null = null;
  let debug = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--date") {
      date = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--debug") {
      debug = true;
    }
  }

  return { date, debug };
}

export function runImportWellness(cwd: string, args: Args): string {
  if (!args.date) {
    throw new Error(
      "Missing --date. Example: npm run import:wellness -- --date 2026-07-01",
    );
  }

  parseDate(args.date);
  const { config } = loadAthleteConfig(cwd);
  const result = importGarminWellness({
    cwd,
    date: args.date,
    timezone: config.timezone,
    debug: args.debug,
  });

  return formatGarminWellnessImportReport(result);
}

if (require.main === module) {
  try {
    console.log(
      runImportWellness(
        process.cwd(),
        parseImportWellnessArgs(process.argv.slice(2)),
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
