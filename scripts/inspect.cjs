const { existsSync } = require("node:fs");
const { join } = require("node:path");

const checks = [
  ["Example athlete config", "config/athlete.example.json"],
  ["Local athlete config", "private/athlete.config.local.json"],
  ["Daily notes template", "input/manual/daily-notes.template.csv"],
  ["Activity notes template", "input/manual/activity-notes.template.csv"],
  ["Manual activities template", "input/manual/manual-activities.template.csv"],
  ["Plan notes template", "input/manual/plan-notes.template.md"],
  ["Private folder", "private"],
  ["Manual input folder", "input/manual"],
  ["Garmin input folder", "input/garmin"],
  ["Strava input folder", "input/strava"],
  ["Output folder", "output"],
];

console.log("Marathon Coach Prompt Generator Inspect\n");

for (const [label, relativePath] of checks) {
  const status = existsSync(join(process.cwd(), relativePath)) ? "OK" : "MISSING";
  console.log(`${status} ${label}: ${relativePath}`);
}

console.log(
  "\nWarning: do not commit private athlete data, real input files, exports, screenshots, generated summaries, .env files, or credentials.",
);
console.log("Inspect reports file presence only and does not print private file contents.");
