import fs from "node:fs";
import path from "node:path";

import { parseLessons } from "./lessons.mjs";

const HEADER_RULES = [
  [/^Status: `(accepted|lab-test|defer|reject)`/m, "header needs a canonical Status enum (accepted|lab-test|defer|reject)"],
  [/Consumer: /, "header needs Consumer:"],
  [/Owner: /, "header needs Owner:"],
  [/Verified: \d{4}-\d{2}-\d{2}/, "header needs Verified: YYYY-MM-DD"],
];

export function checkDurablePages({ root }) {
  const errors = [];
  const relative = (file) => path.relative(root, file).split(path.sep).join("/");
  const header = (file) => {
    const text = fs.readFileSync(file, "utf8").split("\n## ")[0];
    for (const [pattern, message] of HEADER_RULES) {
      if (!pattern.test(text)) errors.push(`${relative(file)}: ${message}`);
    }
  };

  const researchDirectory = path.join(root, "docs", "research");
  const researchIndexFile = path.join(researchDirectory, "README.md");
  if (!fs.existsSync(researchIndexFile)) {
    errors.push("docs/research/README.md is missing the curation index");
    return { errors };
  }
  const researchIndex = fs.readFileSync(researchIndexFile, "utf8");
  const topicsSection = (researchIndex.split("\n## Topics\n")[1] ?? "").split("\n## ")[0];
  for (const entry of fs.readdirSync(researchDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "README.md") continue;
    const topic = path.join(researchDirectory, entry.name);
    header(topic);
    if (!topicsSection.includes(`](${entry.name})`)) {
      errors.push(`${relative(topic)}: topic is missing from docs/research/README.md Topics`);
    }
  }

  const adrDirectory = path.join(root, "docs", "adr");
  const contextFile = path.join(root, "CONTEXT.md");
  if (fs.existsSync(adrDirectory)) {
    const adrEntries = fs.readdirSync(adrDirectory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".md"));
    if (adrEntries.length > 0 && !fs.existsSync(contextFile)) {
      errors.push("CONTEXT.md is missing the knowledge map that must link every accepted ADR");
    } else if (fs.existsSync(contextFile)) {
      const context = fs.readFileSync(contextFile, "utf8")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/<!--[\s\S]*?-->/g, "");
      for (const entry of adrEntries) {
        if (!context.includes(`](docs/adr/${entry.name})`)) {
          errors.push(`docs/adr/${entry.name}: accepted decision is not linked from CONTEXT.md`);
        }
      }
    }
  }

  const lessonsFile = path.join(researchDirectory, "workflow-lessons.md");
  if (fs.existsSync(lessonsFile)) {
    const parsed = parseLessons(lessonsFile);
    if (parsed.rows.length > parsed.budget) {
      errors.push(`docs/research/workflow-lessons.md exceeds ${parsed.budget} lesson rows; displace or condense`);
    }
    for (const row of parsed.malformed) {
      errors.push(`docs/research/workflow-lessons.md: a lesson row needs non-empty Lesson, Evidence, and Enforced by cells: ${row.trim()}`);
    }
  }

  for (const [file, target] of [
    ["capabilities.md", "../capabilities.md"],
    ["migration.md", "../migration.md"],
  ]) {
    header(path.join(root, "docs", file));
    if (!topicsSection.includes(`](${target})`)) {
      errors.push(`docs/research/README.md Topics is missing ${target}`);
    }
  }

  return { errors };
}
