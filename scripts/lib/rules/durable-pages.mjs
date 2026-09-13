import fs from "node:fs";
import { posixRelative } from "../support/path-rules.mjs";
import path from "node:path";

import { parseLessons } from "../lessons/lessons.mjs";

const HEADER_RULES = [
  [/^Status: `(accepted|lab-test|defer|reject)`/m, "header needs a canonical Status enum (accepted|lab-test|defer|reject)"],
  [/Consumer: /, "header needs Consumer:"],
  [/Owner: /, "header needs Owner:"],
  [/Verified: \d{4}-\d{2}-\d{2}/, "header needs Verified: YYYY-MM-DD"],
];

export function checkDurablePages({ root }) {
  const errors = [];
  const relative = (file) => posixRelative(root, file);
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
  const firstLine = researchIndex.split("\n")[0];
  if (!/^#\s+[^|]+$/.test(firstLine)) {
    errors.push("docs/research/README.md must start with a plain heading; a ledger row must not be appended to the title");
  }
  const topicsSection = (researchIndex.split("\n## Topics\n")[1] ?? "").split("\n## ")[0];
  for (const entry of fs.readdirSync(researchDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "README.md") continue;
    const topic = path.join(researchDirectory, entry.name);
    header(topic);
    const topicText = fs.readFileSync(topic, "utf8");
    let fenced = false;
    topicText.split("\n").forEach((line, index) => {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
        return;
      }
      if (!fenced && line.length > 4000) {
        errors.push(`${relative(topic)}:${index + 1}: a non-fenced line is ${line.length} characters; keep run ledgers out of durable pages`);
      }
    });
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
      const stripHtmlComments = (text) => {
        let out = "";
        let index = 0;
        let depth = 0;
        while (index < text.length) {
          const open = text.indexOf("<!--", index);
          const close = text.indexOf("-->", index);
          if (open === -1 && close === -1) {
            if (depth === 0) out += text.slice(index);
            break;
          }
          if (open !== -1 && (close === -1 || open < close)) {
            if (depth === 0) out += text.slice(index, open);
            depth += 1;
            index = open + 4;
          } else {
            depth = Math.max(0, depth - 1);
            index = close + 3;
          }
        }
        return out;
      };
      const stripCode = (text) => {
        const kept = [];
        let fenced = false;
        for (const line of text.split("\n")) {
          if (/^\s{0,3}(```|~~~)/.test(line)) {
            fenced = !fenced;
            continue;
          }
          if (fenced || /^(?: {4,}|\t)/.test(line)) continue;
          kept.push(line.replace(/`[^`]*`/g, ""));
        }
        return kept.join("\n");
      };
      const context = stripCode(stripHtmlComments(fs.readFileSync(contextFile, "utf8")));
      for (const entry of adrEntries) {
        const escaped = entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const target = `(?:\\./)?docs/adr/${escaped}`;
        const inline = new RegExp(`(?<!\\\\)\\[[^\\]]*\\]\\(\\s*<?${target}(?:[#?][^)\\s]*)?\\s*(?:"[^"]*")?\\s*>?\\s*\\)`);
        const reference = new RegExp(`^\\s*\\[[^\\]]+\\]:\\s*<?${target}(?:[#?][^\\s>]*)?>?\\s*$`, "m");
        if (!inline.test(context) && !reference.test(context)) {
          errors.push(`docs/adr/${entry.name}: accepted decision is not linked from CONTEXT.md`);
        }
      }
    }
  }

  const lessonsFile = path.join(researchDirectory, "workflow-lessons.md");
  if (fs.existsSync(lessonsFile)) {
    const parsed = parseLessons(lessonsFile);
    const active = parsed.rows.filter((row) => !row.status).length;
    if (active > parsed.budget) {
      errors.push(`docs/research/workflow-lessons.md exceeds ${parsed.budget} active lesson rows; displace, condense, or retire`);
    }
    for (const row of parsed.malformed) {
      errors.push(`docs/research/workflow-lessons.md: a lesson row needs non-empty Lesson, Evidence, and Enforced by cells: ${row.trim()}`);
    }
  }

  for (const [file, target] of [
    ["capabilities.md", "../capabilities.md"],
    ["migration.md", "../migration.md"],
  ]) {
    const absolute = path.join(root, "docs", file);
    if (!fs.existsSync(absolute)) {
      errors.push(`docs/${file}: missing`);
    } else {
      header(absolute);
    }
    if (!topicsSection.includes(`](${target})`)) {
      errors.push(`docs/research/README.md Topics is missing ${target}`);
    }
  }

  const contractFile = path.join(root, "config", "AGENTS.md");
  if (fs.existsSync(contractFile)) {
    for (const match of fs.readFileSync(contractFile, "utf8").matchAll(/`([^`]+)`/g)) {
      const value = match[1].trim();
      if (!value.includes("/") || /[<>*$\s]/.test(value) || /^\.codex\//.test(value)) continue;
      if (!fs.existsSync(path.join(root, value))) errors.push(`config/AGENTS.md references a missing path: ${value}`);
    }
  }

  return { errors };
}
