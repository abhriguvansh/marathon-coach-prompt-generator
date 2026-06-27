import type { WeekRange } from "../types";

export function parseDate(input: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error(`Invalid date format: ${input}. Expected YYYY-MM-DD.`);
  }

  const [year, month, day] = input.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${input}.`);
  }

  return date;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getWeekRange(date: Date, weekStartsOn: 0 | 1 = 1): WeekRange {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = start.getUTCDay();
  const diff = (day - weekStartsOn + 7) % 7;
  start.setUTCDate(start.getUTCDate() - diff);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  return { start, end };
}

export function daysUntilRace(fromDate: Date, raceDate: Date): number {
  const from = Date.UTC(
    fromDate.getUTCFullYear(),
    fromDate.getUTCMonth(),
    fromDate.getUTCDate(),
  );
  const race = Date.UTC(
    raceDate.getUTCFullYear(),
    raceDate.getUTCMonth(),
    raceDate.getUTCDate(),
  );

  return Math.ceil((race - from) / 86_400_000);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

export function isDateWithinRange(
  date: string,
  startDate: string,
  endDate: string,
): boolean {
  const parsed = parseDate(date).getTime();

  return (
    parsed >= parseDate(startDate).getTime() &&
    parsed <= parseDate(endDate).getTime()
  );
}
