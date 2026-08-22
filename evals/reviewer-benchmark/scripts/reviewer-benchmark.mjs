import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const resultsDir = path.join(root, "results");
const scorer = path.join(root, "scripts", "score-review.mjs");

const usage = `usage:
  reviewer-benchmark.mjs score <review.json>
  reviewer-benchmark.mjs score-prose <opinion.txt>
  reviewer-benchmark.mjs run <lane-command> <review-output.json> <record-name>
  reviewer-benchmark.mjs summary`;

const [command, ...args] = process.argv.slice(2);

if (command === "score") {
  if (!args[0]) throw new Error(usage);
  execFileSync(process.execPath, [scorer, args[0]], { stdio: "inherit" });
} else if (command === "score-prose") {
  if (!args[0]) throw new Error(usage);
  execFileSync(process.execPath, [scorer, args[0], "--prose"], { stdio: "inherit" });
} else if (command === "run") {
  const [laneCommand, outputPath, recordName] = args;
  if (!laneCommand || !outputPath || !recordName) throw new Error(usage);
  execFileSync("/bin/sh", ["-c", `${laneCommand} > "${outputPath}"`], { stdio: "inherit" });
  const score = JSON.parse(
    execFileSync(process.execPath, [scorer, outputPath], { encoding: "utf8" }),
  );
  const record = {
    lane: recordName,
    scoredAt: new Date().toISOString(),
    artifact: path.basename(outputPath),
    ...score,
    doesNotProve:
      "This heuristic score is a deterministic proxy for the public rubric in oracle/evaluation-rubric.md. It does not prove reviewer quality beyond the fixed benchmark subject.",
  };
  fs.writeFileSync(
    path.join(resultsDir, `${recordName}-${new Date().toISOString().slice(0, 10)}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  console.log(JSON.stringify(record, null, 2));
} else if (command === "summary") {
  const files = fs.existsSync(resultsDir)
    ? fs.readdirSync(resultsDir).filter((file) => file.endsWith(".json"))
    : [];
  const rows = files.map((file) => {
    const record = JSON.parse(fs.readFileSync(path.join(resultsDir, file), "utf8"));
    return {
      file,
      lane: record.lane,
      score: record.score,
      matchedClasses: record.matchedClasses,
    };
  });
  console.log(JSON.stringify(rows, null, 2));
} else {
  throw new Error(usage);
}
