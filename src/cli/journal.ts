import { relative } from "node:path";
import { loadAthleteConfig } from "../config/load";
import { parseLocalExports } from "../exports/export-scanner";
import { createJournal } from "../parsers/journal";
import { addDays, formatDate, parseDate } from "../utils/dates";

interface Args {
  date: string | null;
}

export function parseJournalArgs(argv: string[]): Args {
  let date: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--date") {
      date = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return { date };
}

if (require.main === module) {
  try {
    const cwd = process.cwd();
    const args = parseJournalArgs(process.argv.slice(2));
    const timezone = loadTimezone(cwd);
    const exports = parseLocalExports(cwd, { timezone });
    const result = createJournal({
      cwd,
      date: args.date,
      importedActivities: exports.activities,
    });
    const journalPath = relative(cwd, result.journalPath);
    const coachingDate = formatDate(addDays(parseDate(result.date), 1));

    if (result.created) {
      console.log(
        `Created ${journalPath} for completed evidence day ${result.date}.`,
      );
      console.log(
        `Imported activity references added: ${result.importedActivityCount}`,
      );
      console.log(
        "Edit the journal with recovery, nutrition, gear, coach notes, questions, and manual-only activities.",
      );
      console.log(
        `For next-day coaching, run: npm run generate:daily -- --date ${coachingDate}`,
      );
    } else {
      console.log(
        `Journal already exists for completed evidence day ${result.date}; not overwritten: ${journalPath}`,
      );
      console.log(
        "Do not create a journal for the coaching day unless you are logging that completed day.",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

function loadTimezone(cwd: string): string | null {
  try {
    return (
      loadAthleteConfig(cwd, { allowExample: true }).config.timezone ?? null
    );
  } catch {
    return null;
  }
}
