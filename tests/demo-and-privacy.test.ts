import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { generateDemoDaily } from "../src/cli/demo-daily";
import { generateDemoWeekly } from "../src/cli/demo-weekly";

const privacyScript = join(process.cwd(), "scripts/privacy-check.cjs");
const readProjectFile = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("demo generation", () => {
  it("generates fake daily demo output", () => {
    const dir = makeTempDir();
    const markdown = generateDemoDaily(dir);
    const written = readFileSync(
      join(dir, "examples/demo-daily-checkin.md"),
      "utf8",
    );

    assert.doesNotMatch(markdown, /## Athlete Background/);
    assert.doesNotMatch(markdown, /Sample Runner/);
    assert.match(markdown, /Example City Marathon/);
    assert.match(written, /Public-safe fake demo output/);
    assert.match(written, /Fake public demo recovery note/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("generates fake weekly demo output", () => {
    const dir = makeTempDir();
    const markdown = generateDemoWeekly(dir);
    const written = readFileSync(
      join(dir, "examples/demo-weekly-summary.md"),
      "utf8",
    );

    assert.match(markdown, /Weekly Marathon Training Summary/);
    assert.match(markdown, /Sample Runner/);
    assert.match(written, /Fake planned travel week/);
    assert.match(written, /progress, hold steady, or back off/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("privacy check", () => {
  it("allows safe examples and docs warnings", () => {
    const dir = makeGitRepo();
    writeFile(
      join(dir, "examples/demo-daily-checkin.md"),
      "Sample Runner fake demo.",
    );
    writeFile(
      join(dir, "examples/demo-weekly-summary.md"),
      "Example City Marathon fake demo.",
    );
    writeFile(
      join(dir, "README.md"),
      "Warnings may mention access_token, Garmin, Strava, latitude, and longitude.",
    );
    git(dir, ["add", "."]);

    const result = runPrivacyCheck(dir);

    assert.equal(result.ok, true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("catches private config files", () => {
    const dir = makeGitRepo();
    writeFile(join(dir, "private/athlete.config.local.json"), "{}");

    const result = runPrivacyCheck(dir);

    assert.equal(result.ok, false);
    assert.match(result.output, /private files must not be committed/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("catches real manual input files", () => {
    const dir = makeGitRepo();
    writeFile(
      join(dir, "input/manual/daily-notes.csv"),
      "date,notes\n2026-06-22,Fake private note",
    );

    const result = runPrivacyCheck(dir);

    assert.equal(result.ok, false);
    assert.match(
      result.output,
      /real manual input files must not be committed/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("catches real daily journal files", () => {
    const dir = makeGitRepo();
    writeFile(
      join(dir, "input/journal/2026-06-22.md"),
      "# Daily Journal\n\nFake private-style journal note.",
    );

    const result = runPrivacyCheck(dir);

    assert.equal(result.ok, false);
    assert.match(
      result.output,
      /real daily journal files must not be committed/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("catches generated output files", () => {
    const dir = makeGitRepo();
    writeFile(
      join(dir, "output/weekly-summary.md"),
      "Fake generated private summary",
    );

    const result = runPrivacyCheck(dir);

    assert.equal(result.ok, false);
    assert.match(
      result.output,
      /generated private outputs must not be committed/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("catches raw exports and screenshots", () => {
    const dir = makeGitRepo();
    writeFile(join(dir, "input/garmin/demo.fit"), "fake export");
    writeFile(join(dir, "activity-screenshot.png"), "fake image");

    const result = runPrivacyCheck(dir);

    assert.equal(result.ok, false);
    assert.match(result.output, /raw activity export files/);
    assert.match(result.output, /screenshots\/images/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("catches secret-like content in commit candidates", () => {
    const dir = makeGitRepo();
    writeFile(
      join(dir, "src/app.ts"),
      'const token = "access_token";\nAuthorization: Bearer fake',
    );

    const result = runPrivacyCheck(dir);

    assert.equal(result.ok, false);
    assert.match(result.output, /access_token/);
    assert.match(result.output, /Authorization header/);
    assert.match(result.output, /Bearer token/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("public documentation", () => {
  it("documents the local-only privacy model and required commands", () => {
    const readme = readProjectFile("README.md");
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts: Record<string, string>;
    };

    assert.match(readme, /No Strava API/);
    assert.match(readme, /No Garmin API/);
    assert.match(readme, /No OAuth/);
    assert.match(readme, /No OpenAI API calls/);
    assert.match(readme, /npm run privacy:check/);
    assert.match(readme, /private\/athlete\.config\.local\.json/);
    assert.match(readme, /input\/manual\/daily-notes\.csv/);

    for (const script of [
      "inspect",
      "cleanup",
      "generate:daily",
      "generate:weekly",
      "parse:exports",
      "validate:checkin",
      "demo:daily",
      "demo:weekly",
      "privacy:check",
      "format",
      "build",
      "lint",
      "test",
    ]) {
      assert.equal(Boolean(packageJson.scripts[script]), true);
    }
  });

  it("keeps committed demo outputs clearly fake", () => {
    const daily = readProjectFile("examples/demo-daily-checkin.md");
    const weekly = readProjectFile("examples/demo-weekly-summary.md");

    assert.match(daily, /Public-safe fake demo output/);
    assert.doesNotMatch(daily, /## Athlete Background/);
    assert.match(daily, /Example City Marathon/);
    assert.match(weekly, /Public-safe fake demo output/);
    assert.match(weekly, /Sample Runner/);
    assert.match(weekly, /Example City Marathon/);
  });
});

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "marathon-demo-test-"));
}

function makeGitRepo(): string {
  const dir = makeTempDir();
  git(dir, ["init"]);

  return dir;
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: "ignore" });
}

function runPrivacyCheck(cwd: string): { ok: boolean; output: string } {
  try {
    const stdout = execFileSync("node", [privacyScript], {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
    });

    return { ok: true, output: stdout };
  } catch (caught) {
    const error = caught as { stdout?: string; stderr?: string };

    return {
      ok: false,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}
