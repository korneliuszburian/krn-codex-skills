#!/usr/bin/env node
// Render a read-only analysis prompt for ChatGPT GPT-6 Astra from the current
// repository state. Self-contained on purpose: the skill is exported and may be
// read outside this checkout, so it shells out to git and imports nothing from
// the repository's runtime.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { latestFor } from "./project-index.mjs";

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
  } catch (error) {
    const detail = typeof error?.stderr === "string" ? error.stderr.trim() : error.message;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
}

export function gatherContext({ root, base }) {
  const repoUrl = (() => {
    try {
      return git(root, ["remote", "get-url", "origin"]).replace(/\.git$/, "");
    } catch {
      return "";
    }
  })();
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = git(root, ["rev-parse", "HEAD"]);
  const dirty = git(root, ["status", "--porcelain"]);
  // GPT reads the pushed commit through the connector, so the remote ref is the
  // load-bearing fact: a local-only commit or a gitignored file is invisible.
  const remoteHead = (() => {
    try {
      const line = git(root, ["ls-remote", "origin", `refs/heads/${branch}`]);
      return line ? line.split(/\s+/)[0] : "";
    } catch {
      return "";
    }
  })();
  const pushed = remoteHead === head;
  const diffStat = git(root, ["diff", "--stat", `${base}..HEAD`]);
  const nameStatus = git(root, ["diff", "--name-status", `${base}..HEAD`]);
  const files = nameStatus
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      return { status, path: rest[rest.length - 1] };
    });
  const changed = dirty.split("\n").filter(Boolean);
  const untracked = changed.filter((line) => line.startsWith("??")).length;
  const modified = changed.length - untracked;
  return { repoUrl, branch, head, remoteHead, pushed, base, dirty, modified, untracked, diffStat, files };
}

export function renderPrompt({ context, question, focus = [], model = "gpt-6-astra", project = null }) {
  const scope = focus.length > 0 ? focus : context.files.map((entry) => entry.path);
  const fileList = scope.length > 0 ? scope.map((file) => `- \`${file}\``).join("\n") : "- (no files changed in the range)";
  const dirty = context.dirty ? `yes (${context.modified} modified, ${context.untracked} untracked)` : "no";
  const pushed = context.pushed
    ? `yes, the remote ref equals the named commit`
    : `no, the remote ref is ${context.remoteHead || "absent"}; the connector cannot read the named commit`;
  return [
    `You are a read-only principal reviewer with repository access through the GitHub connector. Analyze the named commit and answer the question below.`,
    ``,
    `Contract: do not propose patches or diffs, do not edit anything, do not run or claim to run commands, and do not restate the repository documentation as a finding. Every finding must carry a path:line, a quoted fragment, and an explicit split between observation and inference. A finding without a location is invalid.`,
    ``,
    `## Fixed point`,
    `- repository: ${context.repoUrl}`,
    `- branch: ${context.branch}`,
    `- commit: ${context.head}`,
    `- pushed to the remote: ${pushed}`,
    `- base ref: ${context.base}`,
    `- working tree dirty: ${dirty}`,
    `- untracked or ignored files are invisible to you; if a needed file is absent, ask for it instead of assuming`,
    ...(project
      ? [
          ``,
          `## Project`,
          `- project: ${project[1]}`,
          `- project instructions: ${project[3]}`,
          `- project paths: ${project[4] || "(none recorded)"}`,
          `- project standards: ${project[5] || "(none recorded)"}`,
        ]
      : []),
    ``,
    `## Scope`,
    fileList,
    ``,
    `## Diff summary`,
    context.diffStat || "(empty)",
    ``,
    `## Question`,
    question,
    `Do not decide whether to merge, publish, or deploy; those decisions stay with the repository owner.`,
    ``,
    `## Required answer format`,
    `Return exactly these sections, in this order, and nothing else:`,
    `1. ## Verdict - one paragraph answering the primary question with the strongest evidence.`,
    `2. ## Findings - each finding with severity (blocker | major | minor | nit), path:line, observation, inference, and a described recommendation (never a patch).`,
    `3. ## Open questions - what you cannot decide from the repository, each with the missing input.`,
    `4. ## Non-proofs - what this review did not verify (our gates, the live host, uncommitted state, tests).`,
    `5. ## Next action - the single smallest next step and its owner.`,
    ``,
    `Repeat once: read-only, every finding cites path:line. Then end with the questions you need answered to sharpen this analysis.`,
  ].join("\n");
}

export function promptFromArgs({ root, base, question, focus, model, index }) {
  const context = gatherContext({ root, base });
  const project = index ? latestFor({ index, repository: context.repoUrl }) : null;
  return { context, project, prompt: renderPrompt({ context, question, focus, model, project }) };
}

function parseArgs(args) {
  const options = { root: null, base: null, question: null, questionFile: null, focus: [], json: false, model: "gpt-6-astra", allowUnpushed: false, index: null };
  for (let index = 0; index < args.length; index += 1) {
    const take = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${args[index]} requires a value`);
      index += 1;
      return value;
    };
    if (args[index] === "--root") options.root = take();
    else if (args[index] === "--base") options.base = take();
    else if (args[index] === "--question") options.question = take();
    else if (args[index] === "--question-file") options.questionFile = take();
    else if (args[index] === "--focus") options.focus = take().split(",").map((entry) => entry.trim()).filter(Boolean);
    else if (args[index] === "--model") options.model = take();
    else if (args[index] === "--json") options.json = true;
    else if (args[index] === "--allow-unpushed") options.allowUnpushed = true;
    else if (args[index] === "--index") options.index = take();
    else throw new Error(`unrecognized option: ${args[index]}`);
  }
  if (!options.root) throw new Error("--root is required");
  if (!options.base) throw new Error("--base is required");
  if (!options.question && !options.questionFile) throw new Error("--question or --question-file is required");
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const question = options.question ?? readFileSync(options.questionFile, "utf8").trim();
  if (!question) throw new Error("the question is empty");
  const root = path.resolve(options.root);
  const index = options.index ? path.resolve(root, options.index) : path.join(root, "docs", "research", "ask-gpt-projects.md");
  const { context, project, prompt } = promptFromArgs({ root, base: options.base, question, focus: options.focus, model: options.model, index });
  // The connector reads the pushed commit; a prompt whose commit is local-only
  // cannot work. Refuse rather than send it, unless the operator is drafting.
  if (!context.pushed && !options.allowUnpushed) {
    throw new Error(
      `commit ${context.head} is not on the remote (origin/${context.branch} is ${context.remoteHead || "absent"}); ` +
        "push it first, or pass --allow-unpushed to draft a prompt that the connector cannot read",
    );
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ...context, question, project, prompt }, null, 2)}\n`);
    return;
  }
  process.stdout.write("```text\n");
  process.stdout.write(`${prompt}\n`);
  process.stdout.write("```\n");
}

// The installed skill is a symlink into the release tree, so argv[1] and
// import.meta.url differ by their real paths; compare resolved paths or the
// installed invocation silently does nothing.
const invokedAsScript = (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ask-gpt refused: ${error.message}\n`);
    process.exit(2);
  }
}
