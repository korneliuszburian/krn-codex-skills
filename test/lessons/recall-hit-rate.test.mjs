import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkChangeContract } from "../../scripts/lib/contract/change-contract.mjs";

const lane = fileURLToPath(new URL("../../scripts/lane/run-ticket.sh", import.meta.url));

const HEADER = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n";
const GUARDS = "| Guards | probe | `test:lessons` | | | path:scripts/lib/x.mjs | |";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "krn-hit-rate-"));
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts: { "test:lessons": "x" } })}\n`);
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), HEADER);
  return root;
}

function writeLessons(root, row) {
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `${HEADER}${row}\n`);
}

function fakeGit({ commits, files, baseScripts = { "test:lessons": "x" } }) {
  return (_root, args) => {
    if (args[0] === "merge-base") return { ok: true, out: "" };
    if (args[0] === "log") return { ok: true, out: commits.map((commit) => `${commit.sha}\u001f${commit.subject}\u001f${commit.body ?? ""}`).join("\u001e") };
    if (args[0] === "show") {
      const last = args[args.length - 1];
      if (last.includes(":package.json")) return { ok: true, out: JSON.stringify({ scripts: baseScripts }) };
      return { ok: true, out: (files[last] ?? []).join("\0") };
    }
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "ls-tree") return { ok: true, out: "" };
    if (args[0] === "rev-parse") return { ok: false, out: "" };
    return { ok: false, out: "" };
  };
}

const green = () => ({ ok: true, status: 0 });

function report(root, body, git = fakeGit({ commits: [{ sha: "a1", subject: "fix: change", body }], files: { a1: ["scripts/lib/x.mjs"] } })) {
  return checkChangeContract({ root, base: "base", git, run: green });
}

const recallErrors = (result) => result.errors.filter((entry) => entry.rule === "unreconstructed-recall");
const waiverErrors = (result) => result.errors.filter((entry) => entry.rule === "recall-waiver-unresolved");

const withRoot = (run) => {
  const root = makeRoot();
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

function runDelivery(root, { recall, usage, sentinel = "nonce-abc123", events = "prompt nonce-abc123\n" }) {
  const recallFile = join(root, "recall.json");
  const usageFile = join(root, "usage.json");
  const eventsFile = join(root, "events.jsonl");
  const journal = join(root, "journal.txt");
  if (recall !== null) writeFileSync(recallFile, JSON.stringify(recall));
  if (usage !== null) writeFileSync(usageFile, JSON.stringify(usage));
  writeFileSync(eventsFile, events);
  const env = {
    ...process.env,
    RECALL_JSON: recall === null ? join(root, "missing-recall.json") : recallFile,
    USAGE_JSON: usage === null ? join(root, "missing-usage.json") : usageFile,
    DELIVERY_SENTINEL: sentinel,
    EVENTS: eventsFile,
    JOURNAL: journal,
  };
  const result = spawnSync("bash", [lane, "recall-delivery"], { encoding: "utf8", env });
  return { result, journal };
}

test("a flippant waiver naming nothing resolvable is refused", () => {
  withRoot((root) => {
    writeLessons(root, GUARDS);
    const result = report(root, "Change-contract: test:lessons:red->green\nRecall: none (whatever this is)");
    assert.ok(waiverErrors(result).length > 0, `the waiver must be named and refused: ${JSON.stringify(result.errors)}`);
  });
});

test("a waiver naming a live lesson anchor is accepted", () => {
  withRoot((root) => {
    writeLessons(root, GUARDS);
    const result = report(root, "Change-contract: test:lessons:red->green\nRecall: none (test:lessons)");
    assert.equal(waiverErrors(result).length, 0, JSON.stringify(result.errors));
    assert.equal(recallErrors(result).length, 0, JSON.stringify(result.errors));
  });
});

test("a commit touching a path trigger without reconstruction is reported", () => {
  withRoot((root) => {
    writeLessons(root, GUARDS);
    const result = report(root, "Change-contract: test:lessons:red->green");
    assert.ok(recallErrors(result).length > 0, `an unreconstructed path hit must be reported: ${JSON.stringify(result.errors)}`);
  });
});

test("a recorded Recall-delivery line surfaces hits, binds, and sentinel", () => {
  withRoot((root) => {
    const { result, journal } = runDelivery(root, {
      recall: { hits: [{ lesson: "Guards", trigger: "path:scripts/lib/x.mjs", gate: "`test:lessons`", matched: ["scripts/lib/x.mjs"] }] },
      usage: { usage: [{ lesson: "Guards", hits: 3, binds: 2 }] },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Recall-delivery: Guards hits=3 binds=2 sentinel=seen/);
    assert.ok(existsSync(journal), "the journal line must be appended");
    const recorded = existsSync(journal) ? readFileSync(journal, "utf8") : "";
    assert.match(recorded, /Recall-delivery: Guards hits=3 binds=2 sentinel=seen/);
    const read = spawnSync("bash", [lane, "recall-delivery-report", journal, "Guards"], { encoding: "utf8" });
    assert.match(read.stdout, /Guards hits=3 binds=2 sentinel=seen/);
  });
});

test("a missing delivery line is reported as unknown, never zero", () => {
  withRoot((root) => {
    const { result, journal } = runDelivery(root, {
      recall: { hits: [{ lesson: "Absent", trigger: "path:scripts/lib/x.mjs" }] },
      usage: { usage: [] },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Recall-delivery: Absent hits=unknown binds=unknown sentinel=seen/);
    assert.doesNotMatch(result.stdout, /hits=0|binds=0/, "an unknown count is never a silent zero");
    const missing = spawnSync("bash", [lane, "recall-delivery-report", journal, "Missing"], { encoding: "utf8" });
    assert.match(missing.stdout, /Missing hits=unknown binds=unknown sentinel=unknown/);
    assert.doesNotMatch(missing.stdout, /hits=0|binds=0/, "an absent journal line is never reported as zero");
  });
});
