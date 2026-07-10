import { formatIngestReport, ingestInbox } from "../ingest/inbox";
import { runCoachWorkflow } from "./coach";

interface IngestArgs {
  date: string | null;
  debug: boolean;
  archive: boolean;
  coach: boolean;
}

export function parseIngestArgs(argv: string[]): IngestArgs {
  let date: string | null = null;
  let debug = false;
  let archive = false;
  let coach = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--date") {
      date = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--debug") {
      debug = true;
      continue;
    }

    if (arg === "--archive") {
      archive = true;
      continue;
    }

    if (arg === "--coach") {
      coach = true;
    }
  }

  return { date, debug, archive, coach };
}

export function runIngestCli(cwd: string, args: IngestArgs): string {
  if (!args.date) {
    throw new Error(
      "Missing --date. Example: npm run ingest -- --date 2026-07-07",
    );
  }

  const result = ingestInbox({
    cwd,
    date: args.date,
    debug: args.debug,
    archive: args.archive,
  });

  if (args.coach) {
    const coachLines: string[] = [];

    runCoachWorkflow({
      cwd,
      args: {
        mode: "explicit",
        evidenceDate: args.date,
        coachingDate: null,
        includeAthleteBackground: false,
        debug: args.debug,
      },
      log: (message) => {
        coachLines.push(message);
      },
    });
    result.coachOutput = coachLines.join("\n");
  }

  return formatIngestReport(result);
}

if (require.main === module) {
  try {
    console.log(
      runIngestCli(process.cwd(), parseIngestArgs(process.argv.slice(2))),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
