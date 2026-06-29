import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, unlinkSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

type CleanupCategory = "export" | "output" | "journal";
type CleanupMode = "dry-run" | "delete";

interface CleanupArgs {
  dryRun: boolean;
  yes: boolean;
  olderThanDays: number | null;
  includeJournals: boolean;
}

export interface CleanupCandidate {
  absolutePath: string;
  relativePath: string;
  category: CleanupCategory;
  sizeBytes: number;
}

export interface CleanupResult {
  mode: CleanupMode;
  olderThanDays: number;
  cutoffDate: Date;
  candidates: CleanupCandidate[];
  skippedTracked: string[];
  skippedSymlinks: string[];
  deleted: CleanupCandidate[];
  gitAvailable: boolean;
  warning: string | null;
}

const DEFAULT_RETENTION_DAYS = 14;
const JOURNAL_RETENTION_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseCleanupArgs(argv: string[]): CleanupArgs {
  let dryRun = false;
  let yes = false;
  let olderThanDays: number | null = null;
  let includeJournals = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--yes") {
      yes = true;
      continue;
    }

    if (arg === "--include-journals") {
      includeJournals = true;
      continue;
    }

    if (arg === "--older-than-days") {
      const value = argv[index + 1];
      olderThanDays = parseOlderThanDays(value);
      index += 1;
    }
  }

  if (dryRun && yes) {
    throw new Error("Use either --dry-run or --yes, not both.");
  }

  return { dryRun, yes, olderThanDays, includeJournals };
}

export function runCleanup(input: {
  cwd: string;
  args: CleanupArgs;
  now?: Date;
}): CleanupResult {
  const olderThanDays =
    input.args.olderThanDays ??
    (input.args.includeJournals
      ? JOURNAL_RETENTION_DAYS
      : DEFAULT_RETENTION_DAYS);
  const mode: CleanupMode = input.args.yes ? "delete" : "dry-run";
  const now = input.now ?? new Date();
  const cutoffDate = new Date(now.getTime() - olderThanDays * MS_PER_DAY);
  const tracked = loadTrackedFiles(input.cwd);

  if (tracked === null) {
    return {
      mode,
      olderThanDays,
      cutoffDate,
      candidates: [],
      skippedTracked: [],
      skippedSymlinks: [],
      deleted: [],
      gitAvailable: false,
      warning:
        "Git tracked-file check was unavailable. Cleanup failed safe and did not list or delete files.",
    };
  }

  const scan = scanCleanupCandidates({
    cwd: input.cwd,
    cutoffDate,
    tracked,
    includeJournals: input.args.includeJournals,
  });
  const deleted: CleanupCandidate[] = [];

  if (mode === "delete") {
    for (const candidate of scan.candidates) {
      unlinkSync(candidate.absolutePath);
      deleted.push(candidate);
    }
  }

  return {
    mode,
    olderThanDays,
    cutoffDate,
    candidates: scan.candidates,
    skippedTracked: scan.skippedTracked,
    skippedSymlinks: scan.skippedSymlinks,
    deleted,
    gitAvailable: true,
    warning: null,
  };
}

export function formatCleanupReport(result: CleanupResult): string {
  const lines = [
    "MCPG cleanup",
    "",
    `Mode: ${result.mode === "delete" ? "delete" : "dry run"}`,
    `Older than: ${result.olderThanDays} days`,
    `Cutoff date: ${formatDate(result.cutoffDate)}`,
    "",
  ];

  if (result.warning) {
    lines.push(result.warning);
    lines.push("");
  }

  if (result.skippedTracked.length > 0) {
    lines.push("Skipped tracked file:", "");
    lines.push(...result.skippedTracked.map((path) => `* ${path}`));
    lines.push("");
  }

  if (result.mode === "delete" && result.deleted.length > 0) {
    lines.push("Deleted files:", "");
    lines.push(
      ...result.deleted.map((candidate) => `* ${candidate.relativePath}`),
    );
    lines.push("", "Summary:", "");
    lines.push(`* Deleted files: ${result.deleted.length}`);
    lines.push(`* Freed space: ${formatBytes(sumSize(result.deleted))}`);

    return lines.join("\n");
  }

  if (result.candidates.length === 0) {
    lines.push("No eligible files found. Nothing to clean up.");

    if (result.mode === "dry-run") {
      lines.push("");
      lines.push(
        "Dry run only. No files were deleted. Use --yes to delete the listed files.",
      );
    }

    return lines.join("\n");
  }

  lines.push(
    result.mode === "delete"
      ? "Deleted files:"
      : "Files that would be deleted:",
    "",
  );
  lines.push(
    ...result.candidates.map((candidate) => `* ${candidate.relativePath}`),
  );
  lines.push("", "Summary:", "");
  lines.push(`* Export files: ${countByCategory(result.candidates, "export")}`);
  lines.push(`* Output files: ${countByCategory(result.candidates, "output")}`);
  lines.push(
    `* Journal files: ${countByCategory(result.candidates, "journal")}`,
  );
  lines.push(`* Total files: ${result.candidates.length}`);
  lines.push(`* Total size: ${formatBytes(sumSize(result.candidates))}`);

  if (result.mode === "dry-run") {
    lines.push("");
    lines.push("No files were deleted. Use --yes to delete the listed files.");
  }

  return lines.join("\n");
}

function scanCleanupCandidates(input: {
  cwd: string;
  cutoffDate: Date;
  tracked: Set<string>;
  includeJournals: boolean;
}): {
  candidates: CleanupCandidate[];
  skippedTracked: string[];
  skippedSymlinks: string[];
} {
  const candidates: CleanupCandidate[] = [];
  const skippedTracked: string[] = [];
  const skippedSymlinks: string[] = [];

  for (const root of cleanupRoots(input.includeJournals)) {
    const absoluteRoot = resolve(input.cwd, root.path);

    if (!existsSync(absoluteRoot)) {
      continue;
    }

    scanFolder({
      cwd: input.cwd,
      root: absoluteRoot,
      folder: absoluteRoot,
      category: root.category,
      cutoffDate: input.cutoffDate,
      tracked: input.tracked,
      candidates,
      skippedTracked,
      skippedSymlinks,
    });
  }

  return { candidates, skippedTracked, skippedSymlinks };
}

function scanFolder(input: {
  cwd: string;
  root: string;
  folder: string;
  category: CleanupCategory;
  cutoffDate: Date;
  tracked: Set<string>;
  candidates: CleanupCandidate[];
  skippedTracked: string[];
  skippedSymlinks: string[];
}): void {
  for (const entry of readdirSync(input.folder, { withFileTypes: true })) {
    const absolutePath = join(input.folder, entry.name);
    const safePath = safeRelative(input.cwd, absolutePath);

    if (!isInside(input.root, absolutePath)) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      input.skippedSymlinks.push(safePath);
      continue;
    }

    if (entry.isDirectory()) {
      scanFolder({ ...input, folder: absolutePath });
      continue;
    }

    if (!entry.isFile() || basename(absolutePath) === ".gitkeep") {
      continue;
    }

    if (input.tracked.has(safePath)) {
      input.skippedTracked.push(safePath);
      continue;
    }

    const stat = lstatSync(absolutePath);

    if (stat.mtime.getTime() >= input.cutoffDate.getTime()) {
      continue;
    }

    input.candidates.push({
      absolutePath,
      relativePath: safePath,
      category: input.category,
      sizeBytes: stat.size,
    });
  }
}

function cleanupRoots(
  includeJournals: boolean,
): Array<{ path: string; category: CleanupCategory }> {
  const roots: Array<{ path: string; category: CleanupCategory }> = [
    { path: "input/strava", category: "export" },
    { path: "input/garmin", category: "export" },
    { path: "input/coros", category: "export" },
    { path: "output", category: "output" },
  ];

  if (includeJournals) {
    roots.push({ path: "input/journal", category: "journal" });
  }

  return roots;
}

function loadTrackedFiles(cwd: string): Set<string> | null {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
    });

    return new Set(output.split("\0").filter(Boolean).map(normalizePath));
  } catch {
    return null;
  }
}

function parseOlderThanDays(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error("--older-than-days must be a positive integer.");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("--older-than-days must be a positive integer.");
  }

  return parsed;
}

function isInside(root: string, path: string): boolean {
  const relativePath = relative(root, path);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !resolve(relativePath).startsWith(".."))
  );
}

function safeRelative(cwd: string, path: string): string {
  return normalizePath(relative(cwd, path));
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function countByCategory(
  candidates: CleanupCandidate[],
  category: CleanupCategory,
): number {
  return candidates.filter((candidate) => candidate.category === category)
    .length;
}

function sumSize(candidates: CleanupCandidate[]): number {
  return candidates.reduce(
    (total, candidate) => total + candidate.sizeBytes,
    0,
  );
}

function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;

  if (kb < 1024) {
    return `${Number(kb.toFixed(1))} KB`;
  }

  return `${Number((kb / 1024).toFixed(1))} MB`;
}

if (require.main === module) {
  try {
    const result = runCleanup({
      cwd: process.cwd(),
      args: parseCleanupArgs(process.argv.slice(2)),
    });

    console.log(formatCleanupReport(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
