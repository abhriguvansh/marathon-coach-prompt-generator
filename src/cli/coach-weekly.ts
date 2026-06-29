import { generateWeeklySummary } from "./generate-weekly";
import { addDays, formatDate, parseDate, todayLocalDate } from "../utils/dates";

interface Args {
  weekStart: string | null;
}

export function parseCoachWeeklyArgs(argv: string[]): Args {
  let weekStart: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--week-start") {
      weekStart = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return { weekStart };
}

export function nextMonday(now = new Date()): string {
  const today = parseDate(todayLocalDate(now));
  const day = today.getUTCDay();
  const daysUntilMonday = (8 - day) % 7 || 7;

  return formatDate(addDays(today, daysUntilMonday));
}

export function runWeeklyCoachWorkflow(input: {
  cwd: string;
  args: Args;
  now?: Date;
  log?: (message: string) => void;
}): ReturnType<typeof generateWeeklySummary> {
  const log = input.log ?? (() => undefined);
  const weekStart = input.args.weekStart ?? nextMonday(input.now);
  const result = generateWeeklySummary(input.cwd, {
    weekStart,
    preview: false,
  });

  log("Weekly coach workflow");
  log("");
  log(`Planning week: ${result.weekStart} to ${result.weekEnd}`);
  log(`Evidence window: ${result.evidenceStart} to ${result.evidenceEnd}`);
  log("Output: output/weekly-checkin.md");

  return result;
}

if (require.main === module) {
  try {
    runWeeklyCoachWorkflow({
      cwd: process.cwd(),
      args: parseCoachWeeklyArgs(process.argv.slice(2)),
      log: console.log,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
