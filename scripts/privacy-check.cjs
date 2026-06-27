const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const allowedExactPaths = new Set([
  "private/.gitkeep",
  "input/garmin/.gitkeep",
  "input/strava/.gitkeep",
  "output/.gitkeep",
  "examples/demo-daily-checkin.md",
  "examples/demo-weekly-summary.md",
]);

const contentAllowlistPrefixes = [
  "README.md",
  "docs/",
  "tests/",
  "scripts/privacy-check.cjs",
  "src/exports/",
  "src/privacy/",
];
const contentAllowlistExactPaths = new Set([
  ".gitignore",
  "src/cli/parse-exports.ts",
  "src/generator/daily-markdown.ts",
  "src/generator/weekly-markdown.ts",
  "scripts/inspect.cjs",
  "src/cli/inspect.ts",
]);
const filenameAllowlistExactPaths = new Set([
  "src/generator/daily-summary.ts",
  "src/generator/weekly-summary.ts",
]);

const riskyFilenameTerms = [
  "garmin export",
  "strava export",
  "activity export",
  "daily-checkin",
  "weekly-summary",
  "athlete.config.local",
  "access token",
  "refresh token",
  "client secret",
];

const riskyContentPatterns = [
  { label: "access_token", pattern: /access_token/i },
  { label: "refresh_token", pattern: /refresh_token/i },
  { label: "client_secret", pattern: /client_secret/i },
  { label: "Authorization header", pattern: /Authorization:/i },
  { label: "Bearer token", pattern: /\bBearer\b/i },
  { label: "Garmin reference", pattern: /\bGarmin\b/ },
  { label: "Strava reference", pattern: /\bStrava\b/ },
  { label: "GPS reference", pattern: /\bGPS\b/i },
  { label: "GPX reference", pattern: /\bGPX\b/i },
  { label: "FIT reference", pattern: /\bFIT\b/ },
  { label: "TCX reference", pattern: /\bTCX\b/i },
  { label: "latitude", pattern: /\blatitude\b/i },
  { label: "longitude", pattern: /\blongitude\b/i },
  { label: "lat coordinate", pattern: /\blat\b/i },
  { label: "lon coordinate", pattern: /\blon\b/i },
];

function gitLines(args, cwd = process.cwd()) {
  return execFileSync("git", args, { cwd, encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listCommitCandidateFiles(cwd = process.cwd()) {
  return unique([
    ...gitLines(["ls-files"], cwd),
    ...gitLines(["ls-files", "--others", "--exclude-standard"], cwd),
  ]).map(normalizePath);
}

function scanPrivacyRisks(cwd = process.cwd()) {
  const files = listCommitCandidateFiles(cwd);
  const risks = [];

  for (const file of files) {
    risks.push(...scanPathRisk(file));
    risks.push(...scanFilenameRisk(file));
  }

  const searchableFiles = files.filter(shouldScanContent);

  for (const file of searchableFiles) {
    let content = "";

    try {
      content = readFileSync(join(cwd, file), "utf8");
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);

    for (const { label, pattern } of riskyContentPatterns) {
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          risks.push({
            type: "content",
            file,
            message: `Risky content pattern (${label}) on line ${index + 1}`,
          });
        }
      });
    }
  }

  return risks;
}

function scanPathRisk(file) {
  if (file.startsWith("tests/fixtures/")) {
    return [];
  }

  if (allowedExactPaths.has(file)) {
    return [];
  }

  const lower = file.toLowerCase();
  const risks = [];

  if (lower.startsWith("private/")) {
    risks.push(pathRisk(file, "private files must not be committed"));
  }

  if (
    lower.startsWith("input/manual/") &&
    !/\.template\.(csv|md)$/i.test(file)
  ) {
    risks.push(pathRisk(file, "real manual input files must not be committed"));
  }

  if (lower.startsWith("input/garmin/")) {
    risks.push(pathRisk(file, "Garmin input files must not be committed"));
  }

  if (lower.startsWith("input/strava/")) {
    risks.push(pathRisk(file, "Strava input files must not be committed"));
  }

  if (lower.startsWith("output/")) {
    risks.push(pathRisk(file, "generated private outputs must not be committed"));
  }

  if (/\.env(\.|$)/i.test(file)) {
    risks.push(pathRisk(file, ".env files must not be committed"));
  }

  if (/\.(fit|tcx|gpx)$/i.test(file)) {
    risks.push(pathRisk(file, "raw activity export files must not be committed"));
  }

  if (/\.(png|jpg|jpeg|heic)$/i.test(file)) {
    risks.push(pathRisk(file, "screenshots/images may contain private activity data"));
  }

  return risks;
}

function scanFilenameRisk(file) {
  if (allowedExactPaths.has(file) || filenameAllowlistExactPaths.has(file)) {
    return [];
  }

  const normalizedName = normalizeForNameMatch(file);
  const risks = [];

  for (const term of riskyFilenameTerms) {
    if (normalizedName.includes(normalizeForNameMatch(term))) {
      risks.push({
        type: "filename",
        file,
        message: `Risky filename term: ${term}`,
      });
    }
  }

  return risks;
}

function shouldScanContent(file) {
  if (contentAllowlistPrefixes.some((prefix) => file.startsWith(prefix))) {
    return false;
  }

  return !allowedExactPaths.has(file) && !contentAllowlistExactPaths.has(file);
}

function pathRisk(file, reason) {
  return {
    type: "path",
    file,
    message: reason,
  };
}

function normalizePath(file) {
  return file.replaceAll("\\", "/");
}

function normalizeForNameMatch(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}

function main() {
  const risks = scanPrivacyRisks();

  if (risks.length === 0) {
    console.log(
      "Privacy check passed: no obvious risky tracked or untracked commit-candidate files found.",
    );
    return;
  }

  console.error("Privacy check found possible risks:");

  for (const risk of risks) {
    console.error(`- ${risk.type}: ${risk.file}: ${risk.message}`);
  }

  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  scanPrivacyRisks,
  scanPathRisk,
  scanFilenameRisk,
};
