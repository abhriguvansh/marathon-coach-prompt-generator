const { execFileSync } = require("node:child_process");

const riskyPathPatterns = [
  /^private\//,
  /^input\/(?!manual\/.*\.template\.(csv|md)$)/,
  /^output\//,
  /\.(fit|tcx|gpx)$/i,
  /\.env(\.|$)/,
];

const riskyTextPatterns = [
  new RegExp("access" + "[_ -]?" + "token", "i"),
  new RegExp("refresh" + "[_ -]?" + "token", "i"),
  new RegExp("client" + "[_ -]?" + "secret", "i"),
  /generated real summar(y|ies)/i,
];

function gitLines(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const trackedFiles = gitLines(["ls-files"]);
const riskyFiles = trackedFiles.filter((file) =>
  riskyPathPatterns.some((pattern) => pattern.test(file.replaceAll("\\", "/"))),
);

const riskyTextMatches = [];

for (const pattern of riskyTextPatterns) {
  try {
    const matches = gitLines(["grep", "-n", "-I", pattern.source, "--", "."]);
    riskyTextMatches.push(...matches);
  } catch (error) {
    if (error.status !== 1) {
      throw error;
    }
  }
}

if (riskyFiles.length === 0 && riskyTextMatches.length === 0) {
  console.log("Privacy check passed: no obvious risky tracked files or text patterns found.");
  process.exit(0);
}

console.error("Privacy check found possible risks:");

for (const file of riskyFiles) {
  console.error(`- Risky tracked path: ${file}`);
}

for (const match of riskyTextMatches) {
  console.error(`- Risky tracked text: ${match}`);
}

process.exit(1);
