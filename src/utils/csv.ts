export type CsvRecord = Record<string, string>;

export function parseCsv(content: string): CsvRecord[] {
  const rows = parseCsvRows(content);

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());

  return rows
    .slice(1)
    .filter((row) => row.some((value) => value.trim() !== ""))
    .map((row) => {
      const record: CsvRecord = {};

      for (let index = 0; index < headers.length; index += 1) {
        record[headers[index]] = row[index] ?? "";
      }

      return record;
    });
}

export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((parsedRow) =>
    parsedRow.some((parsedValue) => parsedValue.trim() !== ""),
  );
}

export function parseOptionalNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function parseOptionalBoolean(
  value: string | undefined,
): boolean | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "yes", "y", "1"].includes(normalized)) {
    return true;
  }

  if (["false", "no", "n", "0"].includes(normalized)) {
    return false;
  }

  return null;
}

export function parseOptionalString(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  return value.trim();
}
