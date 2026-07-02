export interface TimezoneResolution {
  timeZone: string;
  warning: string | null;
}

export function resolveActivityTimezone(
  configuredTimezone: string | null | undefined,
): TimezoneResolution {
  if (!configuredTimezone || configuredTimezone.trim() === "") {
    return {
      timeZone: "UTC",
      warning:
        "Athlete timezone not configured; activity dates were grouped using UTC.",
    };
  }

  const timeZone = configuredTimezone.trim();

  if (!isValidTimeZone(timeZone)) {
    return {
      timeZone: "UTC",
      warning:
        "Athlete timezone was invalid; activity dates were grouped using UTC.",
    };
  }

  return { timeZone, warning: null };
}

export function toAthleteLocalDate(
  timestamp: string | null | undefined,
  timeZone: string,
): string | null {
  if (!timestamp) {
    return null;
  }

  const dateMatch = timestamp.match(/\d{4}-\d{2}-\d{2}/);

  if (!dateMatch) {
    return null;
  }

  if (!hasExplicitOffset(timestamp)) {
    return dateMatch[0];
  }

  const instant = new Date(timestamp);

  if (Number.isNaN(instant.getTime())) {
    return null;
  }

  return formatDateInTimeZone(instant, timeZone);
}

export function toAthleteLocalTime(
  timestamp: string | null | undefined,
  timeZone: string,
): string | null {
  if (!timestamp) {
    return null;
  }

  if (!hasExplicitOffset(timestamp)) {
    const match = timestamp.match(/T?(\d{2}:\d{2}(?::\d{2})?)/);

    return match?.[1] ?? null;
  }

  const instant = new Date(timestamp);

  if (Number.isNaN(instant.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  return `${part(parts, "hour")}:${part(parts, "minute")}:${part(parts, "second")}`;
}

function formatDateInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((candidate) => candidate.type === type)?.value ?? "";
}

function hasExplicitOffset(value: string): boolean {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
