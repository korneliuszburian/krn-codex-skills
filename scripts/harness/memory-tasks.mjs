#!/usr/bin/env node
// Generate harness tasks from a memory-benchmark row set. The rows file is
// produced on the host from the dataset (the LT-104 protocol records the
// command); this generator turns each row into a task the harness can run, so
// the benchmark tasks are reproducible without vendoring the dataset.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const CHECK = `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const norm = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\\s+/g, " ").trim();
test("the answer matches the recorded memory", () => {
  const gold = norm(readFileSync("gold.txt", "utf8"));
  const answers = JSON.parse(readFileSync("answers.json", "utf8"));
  const got = norm(answers[0]);
  assert.ok(answers.length === 1 && (got === gold || got.includes(gold) || gold.includes(got)), \`answer \${JSON.stringify(answers)} does not match the recorded memory\`);
});
`;

export function taskFiles(row, id) {
  const context = String(row.context ?? "");
  const question = String(row.question ?? "").trim();
  const gold = String(row.answer ?? "").trim();
  const task = {
    id,
    prompt:
      "Read context.md and question.txt, then write answers.json as a JSON array with exactly one string answer. Do not write anything else.",
    check: "node check.mjs",
    workspace: `${id}/workspace`,
  };
  return {
    taskMd: `# Harness task: ${id}\n\n\`\`\`krn-harness-task\n${JSON.stringify(task, null, 2)}\n\`\`\`\n`,
    files: {
      "context.md": `${context}\n`,
      "question.txt": `${question}\n`,
      "gold.txt": `${gold}\n`,
      "check.mjs": CHECK,
    },
  };
}

export function writeTasks({ rows, out, prefix = "lme" }) {
  const written = [];
  for (const [index, row] of rows.entries()) {
    const id = `${prefix}-${index}`;
    const dir = path.join(out, id);
    const { taskMd, files } = taskFiles(row, id);
    mkdirSync(path.join(dir, "workspace"), { recursive: true });
    writeFileSync(path.join(dir, "task.md"), taskMd);
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, "workspace", name), content);
    written.push(id);
  }
  return written;
}

function main() {
  const options = { rows: null, out: null, prefix: "lme" };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const take = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${args[index]} requires a value`);
      index += 1;
      return value;
    };
    if (args[index] === "--rows") options.rows = take();
    else if (args[index] === "--out") options.out = take();
    else if (args[index] === "--prefix") options.prefix = take();
    else throw new Error(`unrecognized option: ${args[index]}`);
  }
  if (!options.rows || !options.out) throw new Error("--rows and --out are required");
  const rows = JSON.parse(readFileSync(options.rows, "utf8"));
  const written = writeTasks({ rows, out: options.out, prefix: options.prefix });
  process.stdout.write(`tasks ${written.join(", ")}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
