import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gitAvailable, runGit as git, runGitRaw } from "./git-cli.mjs";
import { capsuleIds, runDirectories } from "./spine-runs.mjs";
import { inspectSpineState, normalizeRunPointer } from "./state-check.mjs";
import { commitTokens, fieldLine, parseCleanup, renderCapsule } from "./capsule-abi.mjs";
import { parseLessons } from "./lessons.mjs";

function resolveRoot(repo) {
  const requested = resolve(repo);
  const requestedStat = statSync(requested, { throwIfNoEntry: false });
  if (!requestedStat) throw new Error(`repository path does not exist: ${requested}`);
  if (!requestedStat.isDirectory()) throw new Error(`state expects a repository directory, got a file: ${requested}`);
  const hasGit = gitAvailable();
  const top = hasGit ? git(requested, ["rev-parse", "--show-toplevel"]) : { ok: false, out: "" };
  return { root: top.ok && top.out ? resolve(top.out) : requested, hasGit };
}

function porcelain(root) {
  const status = runGitRaw(root, ["status", "--porcelain"]);
  if (!status.ok || status.out === "") return [];
  return status.out.split("\n").filter(Boolean).map((line) => line.slice(3).trim()).filter(Boolean);
}

function workflowLessons(root) {
  const relative = join("docs", "research", "workflow-lessons.md");
  const file = join(root, relative);
  if (!existsSync(file)) return { path: null, count: 0, items: [] };
  const { rows } = parseLessons(file);
  const active = rows.filter((row) => !(row.status ?? "").trim());
  return { path: relative, count: active.length, items: active.map((row) => row.lesson) };
}

function renderLessons(lessons) {
  if (lessons.count === 0) return "workflow lessons: none";
  return `workflow lessons (${lessons.count} from ${lessons.path}):\n${lessons.items.map((item) => `- ${item}`).join("\n")}`;
}

function renderErrors(errors) {
  if (errors.length === 0) return "";
  return `\n\nBlocking errors:\n${errors.map((error) => `- ${error.rule}${error.detail ? `: ${error.detail}` : ""}`).join("\n")}`;
}

export function compileCapsule({ repo = process.cwd() } = {}) {
  const { root, hasGit } = resolveRoot(repo);
  const gitRepo = hasGit ? git(root, ["rev-parse", "--is-inside-work-tree"]) : { ok: false, out: "" };
  const usableGit = gitRepo.ok && gitRepo.out === "true";
  const warnings = [];
  const errors = [];

  const head = usableGit ? git(root, ["rev-parse", "HEAD"]) : { ok: false, out: "" };
  const branch = usableGit ? git(root, ["rev-parse", "--abbrev-ref", "HEAD"]) : { ok: false, out: "" };
  const dirty = usableGit ? porcelain(root) : [];
  const runs = runDirectories(root);
  const capsules = capsuleIds(root);
  const runsIgnored = usableGit ? git(root, ["check-ignore", "-q", join(".krn", "runs", ".krn-probe")]).ok : false;

  if (!hasGit) warnings.push("git is not on PATH; head and dirty scope are placeholders");
  else if (!usableGit) warnings.push("not a git worktree; head and dirty scope are placeholders");
  if (capsules.length > 0) warnings.push(`an outcome capsule already exists (${capsules.join(", ")}); resume it instead of opening a second writer`);
  if (usableGit && !runsIgnored) warnings.push("`.krn/runs` is not git-ignored; a capsule here would be tracked");

  const headField = head.ok && head.out ? `HEAD=${head.out}` : "fingerprint=<fill: working-tree fingerprint>";
  const dirtyField = dirty.length === 0 ? "clean" : `${dirty.length} paths: ${dirty.slice(0, 8).join(", ")}${dirty.length > 8 ? ", ..." : ""}`;
  const cleanup = runs.length
    ? `[${runs
        .map((run) => `${run.pointer}; ${run.workflow}; <fill: sole in-goal consumer>; <fill: cleanup trigger>; ACTIVE`)
        .join(", ")}]`
    : "none";

  const values = {
    "Outcome and observable acceptance": "<fill: outcome and acceptance, with the command or path that checks it>",
    "Current workflow owner and sole writer": "<fill: current owner; sole writer>",
    "Outcome state": "ACTIVE",
    "Publication state": "NOT_REQUESTED",
    "Repository base, HEAD or working-tree fingerprint, and dirty-state scope": `base=<fill: recorded base>; ${headField}; dirty=${dirtyField}`,
    "Native Goal identity/state and configured tracker item/state": "none",
    "Restart state": "ABSENT",
    "Outstanding workflow-run cleanup": cleanup,
    Authority: "writes=<fill>; tracker/issue=<fill>; commit=<fill>; push=<fill>; PR=<fill>; merge=<fill>; deployment/install=<fill>",
    "Evidence observed": "<fill: observed evidence>",
    "Explicit non-proofs": "<fill: explicit non-proofs>",
    "Review fixed point and Standards / Spec disposition": "<fill: review fixed point and disposition>",
    "Open unknowns and blockers with owners": "<fill: open unknowns and blockers>",
    "Workflow friction and lesson candidates": "none",
    "Durable CONTEXT / ADR / research references": "<fill: durable references>",
    "Next bounded owner and action": "<fill: next bounded owner and action>",
  };

  const body = renderCapsule(values);
  return {
    root,
    git: usableGit,
    branch: branch.ok ? branch.out : null,
    head: head.ok ? head.out : null,
    dirty,
    ignoredRuns: usableGit ? runsIgnored : null,
    runs,
    capsules,
    capsule: `<outcome-capsule>\n${body}\n</outcome-capsule>`,
    warnings,
    errors,
  };
}

export function resumeBrief({ repo = process.cwd() } = {}) {
  const report = inspectSpineState({ repo });
  const errors = [...report.errors];
  const warnings = [...report.warnings];
  const lessons = workflowLessons(report.root);
  if (report.capsules.length === 0) {
    return {
      root: report.root,
      applicability: "no-file-backed-capsule",
      status: report.status,
      capsules: [],
      lessons,
      errors,
      warnings,
      text: `No file-backed outcome capsule found under .krn/runs/delivery-loop/.${renderErrors(errors)}\n\n${renderLessons(lessons)}`,
    };
  }

  const liveHead = git(report.root, ["rev-parse", "HEAD"]);
  const liveDirty = porcelain(report.root);
  const liveRuns = new Set(runDirectories(report.root).map((run) => run.pointer));
  const briefs = [];

  for (const capsule of report.capsules) {
    const path = join(report.root, capsule.path);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const fixedPoint = fieldLine(text, "Repository base, HEAD or working-tree fingerprint, and dirty-state scope");
    const recorded = commitTokens(fixedPoint);
    const headMoved = recorded.length > 0 && liveHead.ok && liveHead.out !== "" && !recorded.includes(liveHead.out.toLowerCase());
    const cleanupValue = fieldLine(text, "Outstanding workflow-run cleanup");
    const listed = parseCleanup(cleanupValue).entries;
    const listedPointers = new Set(listed.map((entry) => normalizeRunPointer(report.root, entry.pointer)));
    const missingRuns = [...new Set(listed
      .filter((entry) => (entry.state === "ACTIVE" || entry.state === "BLOCKED") && !liveRuns.has(normalizeRunPointer(report.root, entry.pointer)))
      .map((entry) => normalizeRunPointer(report.root, entry.pointer)))];
    const unlistedRuns = [...liveRuns].filter((pointer) => !listedPointers.has(pointer));
    briefs.push({
      id: capsule.id,
      path: capsule.path,
      outcome: fieldLine(text, "Outcome and observable acceptance"),
      outcomeState: fieldLine(text, "Outcome state"),
      publicationState: fieldLine(text, "Publication state"),
      owner: fieldLine(text, "Current workflow owner and sole writer"),
      nextAction: fieldLine(text, "Next bounded owner and action"),
      friction: fieldLine(text, "Workflow friction and lesson candidates"),
      recordedCommits: recorded,
      liveHead: liveHead.ok ? liveHead.out : null,
      headMoved,
      liveDirty,
      listedRuns: [...listedPointers],
      missingRuns,
      unlistedRuns,
    });
  }

  const lines = briefs.map((brief) => {
    const repoLine = `repo: recorded HEAD ${brief.recordedCommits.join(", ") || "none"} / live HEAD ${brief.liveHead ?? "unknown"} (${brief.headMoved ? "MOVED" : "unchanged"}); dirty ${brief.liveDirty.length} paths`;
    const cleanupLine = `cleanup: listed ${brief.listedRuns.length} / live ${brief.listedRuns.length + brief.unlistedRuns.length - brief.missingRuns.length}; missing ${brief.missingRuns.length ? brief.missingRuns.join(", ") : "none"}; unlisted ${brief.unlistedRuns.length ? brief.unlistedRuns.join(", ") : "none"}`;
    return [
      `capsule ${brief.id}`,
      `outcome: ${brief.outcome}`,
      `state: ${brief.outcomeState} / publication ${brief.publicationState}`,
      `owner: ${brief.owner}`,
      `next: ${brief.nextAction}`,
      `friction: ${brief.friction}`,
      repoLine,
      cleanupLine,
    ].join("\n");
  });

  return {
    root: report.root,
    applicability: "checked",
    status: report.status,
    capsules: briefs,
    lessons,
    errors,
    warnings,
    text: `${lines.join("\n\n")}\n\n${renderLessons(lessons)}${renderErrors(errors)}\n\nRun \`krn-codex state check\` before resuming or completing.`,
  };
}
