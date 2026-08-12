import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const resultsDir = path.join(root, "evals", "reviewer-benchmark", "results");
const reviewsDir = path.join(root, "reviews");

function readJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const benchmark = readJsonFiles(resultsDir);
const perLane = new Map();
for (const record of benchmark) {
  const lane = record.lane ?? "unknown";
  if (!perLane.has(lane)) perLane.set(lane, []);
  perLane.get(lane).push(record);
}

const lanes = [...perLane.entries()].map(([lane, records]) => {
  const scores = records.map((record) => record.score ?? 0);
  const mean = Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
  return {
    lane,
    runs: records.length,
    meanScore: mean,
    latestScore: scores.at(-1),
    belowFloor: mean < 5,
    matchedClassesUnion: [...new Set(records.flatMap((record) => record.matchedClasses ?? []))],
  };
});

const dispositions = readJsonFiles(reviewsDir);
const dispositionCounts = dispositions.reduce((counts, record) => {
  const verdict = record.verdict ?? "unknown";
  counts[verdict] = (counts[verdict] ?? 0) + 1;
  return counts;
}, {});

const summary = {
  benchmarkLanes: lanes,
  reviewRecords: dispositions.length,
  dispositionCounts,
  floorRule: "A lane with mean score below 5/10 cannot act as the review gate lane.",
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(summary, null, 2));
