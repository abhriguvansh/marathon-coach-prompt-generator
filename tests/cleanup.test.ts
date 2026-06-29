import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  formatCleanupReport,
  parseCleanupArgs,
  runCleanup,
} from "../src/cli/cleanup";

const NOW = new Date("2026-06-28T12:00:00");
const VERY_OLD = new Date("2026-01-01T12:00:00");
const OLD = new Date("2026-06-01T12:00:00");
const NEW = new Date("2026-06-25T12:00:00");

describe("cleanup CLI", () => {
  it("cleanup command exists", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    assert.equal(Boolean(packageJson.scripts.cleanup), true);
  });

  it("defaults to dry-run mode", () => {
    const args = parseCleanupArgs([]);

    assert.equal(args.dryRun, false);
    assert.equal(args.yes, false);

    const dir = makeGitRepo();
    const oldExport = writeAgedFile(dir, "input/strava/old.fit", OLD);
    const result = runCleanup({ cwd: dir, args, now: NOW });

    assert.equal(result.mode, "dry-run");
    assert.equal(result.olderThanDays, 14);
    assert.equal(existsSync(oldExport), true);
    assert.match(
      formatCleanupReport(result),
      /Dry run only|No files were deleted/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("--yes deletes eligible old export and output files", () => {
    const dir = makeGitRepo();
    const oldExport = writeAgedFile(dir, "input/strava/old.fit", OLD);
    const oldOutput = writeAgedFile(dir, "output/old.md", OLD);

    const result = runCleanup({
      cwd: dir,
      args: parseCleanupArgs(["--yes"]),
      now: NOW,
    });

    assert.equal(result.deleted.length, 2);
    assert.equal(existsSync(oldExport), false);
    assert.equal(existsSync(oldOutput), false);
    assert.match(formatCleanupReport(result), /Deleted files/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps files newer than the threshold and lists older files", () => {
    const dir = makeGitRepo();
    writeAgedFile(dir, "input/garmin/new.fit", NEW);
    writeAgedFile(dir, "input/garmin/old.fit", OLD);

    const result = runCleanup({
      cwd: dir,
      args: parseCleanupArgs(["--dry-run"]),
      now: NOW,
    });

    assert.deepEqual(
      result.candidates.map((candidate) => candidate.relativePath),
      ["input/garmin/old.fit"],
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("never deletes .gitkeep files", () => {
    const dir = makeGitRepo();
    const gitkeep = writeAgedFile(dir, "output/.gitkeep", OLD);

    const result = runCleanup({
      cwd: dir,
      args: parseCleanupArgs(["--yes"]),
      now: NOW,
    });

    assert.equal(result.deleted.length, 0);
    assert.equal(existsSync(gitkeep), true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips tracked files", () => {
    const dir = makeGitRepo();
    const tracked = writeAgedFile(dir, "output/tracked.md", OLD);
    git(dir, ["add", "output/tracked.md"]);

    const result = runCleanup({
      cwd: dir,
      args: parseCleanupArgs(["--yes"]),
      now: NOW,
    });

    assert.equal(result.deleted.length, 0);
    assert.equal(existsSync(tracked), true);
    assert.deepEqual(result.skippedTracked, ["output/tracked.md"]);
    assert.match(formatCleanupReport(result), /Skipped tracked file/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not delete private files, manual notes, or journals by default", () => {
    const dir = makeGitRepo();
    const privateConfig = writeAgedFile(
      dir,
      "private/athlete.config.local.json",
      OLD,
    );
    const manual = writeAgedFile(dir, "input/manual/daily-notes.csv", OLD);
    const journal = writeAgedFile(dir, "input/journal/2026-01-01.md", OLD);

    const result = runCleanup({
      cwd: dir,
      args: parseCleanupArgs(["--yes"]),
      now: NOW,
    });

    assert.equal(result.deleted.length, 0);
    assert.equal(existsSync(privateConfig), true);
    assert.equal(existsSync(manual), true);
    assert.equal(existsSync(journal), true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("--include-journals lists and deletes old journals", () => {
    const dir = makeGitRepo();
    const journal = writeAgedFile(dir, "input/journal/2026-01-01.md", VERY_OLD);

    const dryRun = runCleanup({
      cwd: dir,
      args: parseCleanupArgs(["--include-journals", "--dry-run"]),
      now: NOW,
    });

    assert.equal(dryRun.olderThanDays, 90);
    assert.deepEqual(
      dryRun.candidates.map((candidate) => candidate.relativePath),
      ["input/journal/2026-01-01.md"],
    );

    const deleted = runCleanup({
      cwd: dir,
      args: parseCleanupArgs(["--include-journals", "--yes"]),
      now: NOW,
    });

    assert.equal(deleted.deleted.length, 1);
    assert.equal(existsSync(journal), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("validates cleanup options", () => {
    assert.throws(
      () => parseCleanupArgs(["--older-than-days", "0"]),
      /positive integer/,
    );
    assert.throws(
      () => parseCleanupArgs(["--older-than-days", "nope"]),
      /positive integer/,
    );
    assert.throws(
      () => parseCleanupArgs(["--dry-run", "--yes"]),
      /either --dry-run or --yes/,
    );
  });

  it("ignores missing cleanup folders gracefully", () => {
    const dir = makeGitRepo();
    const result = runCleanup({
      cwd: dir,
      args: parseCleanupArgs(["--dry-run"]),
      now: NOW,
    });

    assert.equal(result.candidates.length, 0);
    assert.match(formatCleanupReport(result), /No eligible files found/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not follow symlinks when the platform allows creating them", () => {
    const dir = makeGitRepo();
    const target = writeAgedFile(dir, "private/secret.txt", OLD);
    const link = join(dir, "input/strava/linked-secret.fit");
    mkdirSync(dirname(link), { recursive: true });

    try {
      symlinkSync(target, link);
    } catch {
      rmSync(dir, { recursive: true, force: true });
      return;
    }

    const result = runCleanup({
      cwd: dir,
      args: parseCleanupArgs(["--yes"]),
      now: NOW,
    });

    assert.equal(existsSync(target), true);
    assert.equal(existsSync(link), true);
    assert.equal(result.deleted.length, 0);
    assert.deepEqual(result.skippedSymlinks, [
      "input/strava/linked-secret.fit",
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not print raw file contents", () => {
    const dir = makeGitRepo();
    writeAgedFile(dir, "input/strava/old.fit", OLD, "lat=47.000 lon=-122.000");

    const report = formatCleanupReport(
      runCleanup({
        cwd: dir,
        args: parseCleanupArgs(["--dry-run"]),
        now: NOW,
      }),
    );

    assert.doesNotMatch(report, /47\.000|-122\.000|lat=|lon=/);
    assert.match(report, /input\/strava\/old\.fit/);
    rmSync(dir, { recursive: true, force: true });
  });
});

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "marathon-cleanup-test-"));
  git(dir, ["init"]);

  return dir;
}

function writeAgedFile(
  dir: string,
  relativePath: string,
  mtime: Date,
  content = "fake file",
): string {
  const path = join(dir, relativePath);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  utimesSync(path, mtime, mtime);

  return path;
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: "ignore" });
}
