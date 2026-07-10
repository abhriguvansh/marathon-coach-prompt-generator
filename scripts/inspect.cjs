const { existsSync } = require("node:fs");
const { readdirSync } = require("node:fs");
const { extname, join } = require("node:path");

const supportedExportExtensions = new Set([
  ".csv",
  ".tcx",
  ".gpx",
  ".json",
  ".fit",
  ".zip",
]);

const checks = [
  ["Example athlete config", "config/athlete.example.json"],
  ["Local athlete config", "private/athlete.config.local.json"],
  ["Daily notes template", "input/manual/daily-notes.template.csv"],
  ["Activity notes template", "input/manual/activity-notes.template.csv"],
  ["Manual activities template", "input/manual/manual-activities.template.csv"],
  ["Plan notes template", "input/manual/plan-notes.template.md"],
  ["Daily journal template", "input/journal/template.md"],
  ["Private folder", "private"],
  ["Manual input folder", "input/manual"],
  ["Journal input folder", "input/journal"],
  ["Inbox drop folder", "input/inbox"],
  ["Processed archive folder", "input/processed"],
  ["Garmin input folder", "input/garmin"],
  ["Strava input folder", "input/strava"],
  ["Output folder", "output"],
];

console.log("Marathon Coach Prompt Generator Inspect\n");

for (const [label, relativePath] of checks) {
  const status = existsSync(join(process.cwd(), relativePath)) ? "OK" : "MISSING";
  console.log(`${status} ${label}: ${relativePath}`);
}

const exportStatus = inspectExportFolders(process.cwd());

console.log("");
console.log("Local Export Status");
console.log(`Garmin export files found: ${exportStatus.garminCount}`);
console.log(`Strava export files found: ${exportStatus.stravaCount}`);
console.log(`Inbox files found: ${exportStatus.inboxCount}`);
console.log(`Processed archive files found: ${exportStatus.processedCount}`);
console.log(
  `Supported file types detected: ${
    exportStatus.supportedTypes.length === 0
      ? "none"
      : exportStatus.supportedTypes.join(", ")
  }`,
);
console.log(
  `Unsupported file types detected: ${
    exportStatus.unsupportedTypes.length === 0
      ? "none"
      : exportStatus.unsupportedTypes.join(", ")
  }`,
);
for (const warning of exportStatus.warnings) {
  console.log(`WARNING ${warning}`);
}

console.log(
  "\nWarning: do not commit private athlete data, real input files, exports, screenshots, generated summaries, .env files, or credentials.",
);
console.log("Inspect reports file presence only and does not print private file contents.");

function inspectExportFolders(cwd) {
  const folders = [
    ["input/garmin", "garmin"],
    ["input/strava", "strava"],
    ["input/inbox", "inbox"],
    ["input/processed", "processed"],
  ];
  const supportedTypes = new Set();
  const unsupportedTypes = new Set();
  const warnings = [];
  let garminCount = 0;
  let stravaCount = 0;
  let inboxCount = 0;
  let processedCount = 0;

  for (const [relativeFolder, label] of folders) {
    const folder = join(cwd, relativeFolder);

    if (!existsSync(folder)) {
      warnings.push(`${relativeFolder} is missing.`);
      continue;
    }

    const files = walkFiles(folder).filter((file) => !file.endsWith(".gitkeep"));

    if (label === "garmin") {
      garminCount = files.length;
    } else if (label === "strava") {
      stravaCount = files.length;
    } else if (label === "inbox") {
      inboxCount = files.length;
    } else {
      processedCount = files.length;
    }

    for (const file of files) {
      const extension = extname(file).toLowerCase() || "(none)";

      if (supportedExportExtensions.has(extension)) {
        supportedTypes.add(extension);
      } else {
        unsupportedTypes.add(extension);
      }
    }
  }

  return {
    garminCount,
    stravaCount,
    inboxCount,
    processedCount,
    supportedTypes: [...supportedTypes],
    unsupportedTypes: [...unsupportedTypes],
    warnings,
  };
}

function walkFiles(root) {
  const entries = readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(absolutePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}
