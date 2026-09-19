import fs from "node:fs";
import { posixRelative } from "../support/path-rules.mjs";
import { escapeRegExp } from "../kernel/text.mjs";
import path from "node:path";

import { lessonStructureFindings } from "../lessons/lessons.mjs";
import { fenceLines, unfencedLines } from "./content-rules.mjs";
import { unbalancedFence } from "../support/fences.mjs";

const HEADER_RULES = [
  [/^Status: `(accepted|lab-test|defer|reject)`/m, "header needs a canonical Status enum (accepted|lab-test|defer|reject)"],
  [/Consumer: /, "header needs Consumer:"],
  [/Owner: /, "header needs Owner:"],
  [/Verified: \d{4}-\d{2}-\d{2}/, "header needs Verified: YYYY-MM-DD"],
];

export function checkDurablePages({ root }) {
  const errors = [];
  const linksTarget = (text, target) =>
    new RegExp(`(?<!\\\\)\\[[^\\]\\n]*\\]\\(\\s*<?${escapeRegExp(target)}(?:[#?][^)\\s]*)?\\s*(?:"[^"]*"|'[^']*')?\\s*>?\\s*\\)`).test(text);
  const relative = (file) => posixRelative(root, file);
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
        if (depth === 0) out += text.slice(index, close);
        depth = Math.max(0, depth - 1);
        index = close + 3;
      }
    }
    return out;
  };
  const fenceFree = (text) => fenceLines(text).filter((entry) => !entry.fenced).map((entry) => entry.line).join("\n");
  const visible = (text) => stripHtmlComments(fenceFree(text));
  const stripCode = (text) => {
    const kept = [];
    for (const { line, fenced } of fenceLines(text)) {
      if (fenced || /^(?: {4,}|\t)/.test(line)) continue;
      kept.push(line.replace(/`[^`]*`/g, ""));
    }
    return kept.join("\n");
  };
  const header = (file) => {
    const text = visible(fs.readFileSync(file, "utf8").split("\n## ")[0]);
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
  const topicsVisible = stripCode(stripHtmlComments(topicsSection));
  for (const entry of fs.readdirSync(researchDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "README.md") continue;
    const topic = path.join(researchDirectory, entry.name);
    header(topic);
    const topicText = fs.readFileSync(topic, "utf8");
    if (unbalancedFence(topicText)) {
      errors.push(`${relative(topic)}: has an unterminated code fence; line-length and link checks cannot be trusted`);
    }
    for (const { line, number } of unfencedLines(topicText)) {
      if (line.length > 4000) {
        errors.push(`${relative(topic)}:${number}: a non-fenced line is ${line.length} characters; keep run ledgers out of durable pages`);
      }
    }
    if (!linksTarget(topicsVisible, entry.name)) {
      errors.push(`${relative(topic)}: topic is missing from docs/research/README.md Topics`);
    }
  }

  const adrDirectory = path.join(root, "docs", "adr");
  const contextFile = path.join(root, "CONTEXT.md");
  if (fs.existsSync(adrDirectory) && fs.statSync(adrDirectory).isDirectory()) {
    const adrEntries = fs.readdirSync(adrDirectory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".md"));
    if (adrEntries.length > 0 && !fs.existsSync(contextFile)) {
      errors.push("CONTEXT.md is missing the knowledge map that must link every accepted ADR");
    } else if (fs.existsSync(contextFile)) {
      const context = stripCode(stripHtmlComments(fs.readFileSync(contextFile, "utf8")));
      for (const entry of adrEntries) {
        const escaped = escapeRegExp(entry.name);
        const target = `(?:\\./)?docs/adr/${escaped}`;
        const inline = new RegExp(`(?<!\\\\)\\[[^\\]]*\\]\\(\\s*<?${target}(?:[#?][^)\\s]*)?\\s*(?:"[^"]*"|'[^']*')?\\s*>?\\s*\\)`);
        const reference = new RegExp(`^\\s*\\[[^\\]]+\\]:\\s*<?${target}(?:[#?][^\\s>]*)?>?\\s*(?:"[^"]*"|'[^']*')?\\s*$`, "m");
        if (!inline.test(context) && !reference.test(context)) {
          errors.push(`docs/adr/${entry.name}: accepted decision is not linked from CONTEXT.md`);
        }
      }
    }
  }

  const lessonsFile = path.join(researchDirectory, "workflow-lessons.md");
  if (fs.existsSync(lessonsFile)) {
    for (const finding of lessonStructureFindings({ root }).findings) {
      errors.push(`docs/research/workflow-lessons.md: ${finding.message}`);
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
    if (!linksTarget(topicsVisible, target)) {
      errors.push(`docs/research/README.md Topics is missing ${target}`);
    }
  }

  const contractFile = path.join(root, "config", "AGENTS.md");
  if (fs.existsSync(contractFile)) {
    for (const match of visible(fs.readFileSync(contractFile, "utf8")).matchAll(/`([^`]+)`/g)) {
      const value = match[1].trim();
      if (!value.includes("/") || /[<>*$\s]/.test(value) || /^\.codex\//.test(value)) continue;
      const resolved = path.resolve(root, value);
      if (resolved !== root && !resolved.startsWith(root + path.sep)) continue;
      if (!fs.existsSync(resolved)) errors.push(`config/AGENTS.md references a missing path: ${value}`);
    }
  }

  return { errors };
}
