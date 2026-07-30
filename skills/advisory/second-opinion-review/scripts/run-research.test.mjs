import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildResearchPrompt,
  jobPathFor,
  resultPathFor,
} from "./research-campaign.mjs";
import { prepareArtifactDirectory } from "./prepare-artifacts.mjs";
import { checkResearch, runResearch } from "./run-research.mjs";

const skillRoot = fileURLToPath(new URL("..", import.meta.url));

test("runs research CLIs through an installed-style skill symlink", () => {
  const sandbox = fs.mkdtempSync(
    path.join(os.tmpdir(), "second-opinion-research-symlink-test-"),
  );
  const installedSkill = path.join(sandbox, "second-opinion-review");
  try {
    fs.symlinkSync(skillRoot, installedSkill, "dir");

    const runner = spawnSync(
      process.execPath,
      [path.join(installedSkill, "scripts", "run-research.mjs")],
      { encoding: "utf8" },
    );
    assert.equal(runner.status, 1);
    assert.match(runner.stderr, /usage: run-research\.mjs/);

    const validator = spawnSync(
      process.execPath,
      [path.join(installedSkill, "scripts", "research-campaign.mjs")],
      { encoding: "utf8" },
    );
    assert.equal(validator.status, 1);
    assert.match(validator.stderr, /usage: research-campaign\.mjs/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("gives the model the exact dynamic result identity", () => {
  const campaign = {
    campaign_id: "exact-campaign",
    objective: "Inspect one source.",
    human_decisions: ["Adoption remains local."],
    does_not_prove: ["Coverage is not correctness."],
    sources: [
      {
        id: "source-one",
        kind: "repository",
        locator: ".",
        revision: "a".repeat(40),
        authority: "local",
        purpose: "Evidence.",
        required: true,
      },
    ],
  };
  const shard = {
    id: "exact-shard",
    kind: "research",
    objective: "Inspect it.",
    source_ids: ["source-one"],
    depends_on: [],
    deliverable: "Ledger.",
  };

  const prompt = buildResearchPrompt({
    campaign,
    shard,
    dependencyPaths: [],
  });

  assert.match(prompt, /campaign_id: "exact-campaign"/);
  assert.match(prompt, /shard_id: "exact-shard"/);
  assert.match(prompt, /shard_kind: "research"/);
  assert.match(prompt, /lowercase kebab-case only/);
  assert.doesNotMatch(prompt, /evidence_gaps\[\]\.id/);
});

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function makeFixture() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-research-test-"));
  const repository = path.join(sandbox, "repository");
  const sourceDirectory = path.join(sandbox, "sources");
  fs.mkdirSync(repository);
  fs.mkdirSync(sourceDirectory);
  fs.writeFileSync(path.join(repository, "README.md"), "fixed repository evidence\n");
  run("git", ["init", "-q"], repository);
  run("git", ["config", "user.name", "Research Test"], repository);
  run("git", ["config", "user.email", "research@example.invalid"], repository);
  fs.mkdirSync(path.join(repository, ".krn", "runs"), { recursive: true });
  fs.writeFileSync(
    path.join(repository, ".krn", "runs", ".gitignore"),
    "*\n!.gitignore\n",
  );
  run("git", ["add", "README.md", ".krn/runs/.gitignore"], repository);
  run("git", ["commit", "-qm", "test fixture"], repository);
  const commit = run("git", ["rev-parse", "HEAD"], repository);
  const passDirectory = prepareArtifactDirectory({
    slug: "research-test",
    role: "research",
    cwd: repository,
  });

  const transcript = path.join(sourceDirectory, "transcript.txt");
  fs.writeFileSync(transcript, "fixed transcript evidence\n");
  const transcriptSha256 = createHash("sha256")
    .update(fs.readFileSync(transcript))
    .digest("hex");
  const campaignFile = path.join(passDirectory, "campaign.json");
  const campaign = {
    campaign_version: "1",
    campaign_id: "research-test",
    objective: "Derive mechanisms from a fixed repository, URL, and transcript.",
    sources: [
      {
        id: "current-repository",
        kind: "repository",
        locator: ".",
        revision: commit,
        authority: "local",
        purpose: "Compare recommendations with the current implementation.",
        required: true,
      },
      {
        id: "practitioner-source",
        kind: "url",
        locator: "https://example.com/source",
        revision: "version-1",
        authority: "primary",
        purpose: "Supply the external mechanism under investigation.",
        required: true,
      },
      {
        id: "video-transcript",
        kind: "artifact",
        locator: transcript,
        revision: transcriptSha256,
        authority: "practitioner",
        purpose: "Capture practitioner workflow mechanisms.",
        required: true,
      },
    ],
    shards: [
      {
        id: "source-analysis",
        kind: "research",
        objective: "Cover all fixed sources.",
        source_ids: ["current-repository", "practitioner-source", "video-transcript"],
        depends_on: [],
        deliverable: "Mechanism ledger.",
      },
      {
        id: "synthesis",
        kind: "synthesis",
        objective: "Synthesize the validated source analysis.",
        source_ids: ["current-repository", "practitioner-source", "video-transcript"],
        depends_on: ["source-analysis"],
        deliverable: "Decision-ready synthesis.",
      },
    ],
    human_decisions: ["Adoption remains local."],
    does_not_prove: ["Coverage does not prove correctness."],
  };
  fs.writeFileSync(campaignFile, `${JSON.stringify(campaign, null, 2)}\n`);
  return { sandbox, repository, passDirectory, campaignFile, campaign };
}

function structuredResult(
  campaign,
  shardId,
  { omitSourceId, unavailableSourceId } = {},
) {
  const shard = campaign.shards.find((candidate) => candidate.id === shardId);
  return {
    result_version: "1",
    campaign_id: campaign.campaign_id,
    shard_id: shardId,
    status: "complete",
    scope_summary: `Completed ${shardId}.`,
    source_coverage: shard.source_ids
      .filter((sourceId) => sourceId !== omitSourceId)
      .map((sourceId) => ({
        source_id: sourceId,
        status: sourceId === unavailableSourceId ? "unavailable" : "used",
        evidence_summary: `Used fixed source ${sourceId}.`,
      })),
    findings: [
      {
        id: `${shardId}-finding`,
        title: "Bounded mechanism",
        citations: [
          {
            source_id: shard.source_ids[0],
            locator: "README.md:1",
            detail: "The fixed source provides the bounded evidence for this mechanism.",
          },
        ],
        mechanism: "A fixed source supports one bounded mechanism.",
        conditions_and_traps: "It applies only under the named source conditions.",
        implication: "Keep the local decision evidence-bounded.",
        candidate_disposition: "lab_test",
        consumer: "The local workflow owner.",
        example: "Run one focused falsifier.",
        falsifier: "The focused trial disagrees with the mechanism.",
        does_not_prove: "It does not prove product readiness.",
      },
    ],
    evidence_gaps: [],
    human_decisions: [],
    does_not_prove: ["Research output remains advisory."],
  };
}

function envelope(result, overrides = {}) {
  return {
    status: 0,
    stdout: JSON.stringify({
      structured_output: result,
      session_id: "00000000-0000-4000-8000-000000000001",
      total_cost_usd: 1.25,
      duration_ms: 5000,
      num_turns: 3,
      ...overrides,
    }),
    stderr: "",
  };
}

const testEnvironment = {
  ...process.env,
  SECOND_OPINION_RESEARCH_MAX_BUDGET_USD: "2",
  SECOND_OPINION_RESEARCH_TIMEOUT_SECONDS: "60",
  SECOND_OPINION_RESEARCH_EFFORT: "high",
};
delete testEnvironment.SECOND_OPINION_CONTEXT_ROOT;
delete testEnvironment.SECOND_OPINION_WORKING_RUNS;

test("runs read-only research and synthesis shards with durable validated results", () => {
  const fixture = makeFixture();
  const invocations = [];
  try {
    for (const shardId of ["source-analysis", "synthesis"]) {
      const outcome = runResearch({
        campaignPath: fixture.campaignFile,
        shardId,
        cwd: fixture.repository,
        env: testEnvironment,
        windowCheck: () => {},
        claudeInvoker: (invocation) => {
          invocations.push(invocation);
          return envelope(structuredResult(fixture.campaign, shardId));
        },
      });
      assert.equal(outcome.outputFile, resultPathFor(fixture.campaignFile, shardId));
      const job = JSON.parse(fs.readFileSync(jobPathFor(fixture.campaignFile, shardId)));
      assert.equal(job.state, "complete");
      assert.deepEqual(Object.keys(job.repository).sort(), ["commit", "tree"]);
      assert.equal(job.max_budget_usd, "2");
      assert.equal(job.claude.total_cost_usd, 1.25);
      assert.equal(
        checkResearch({
          campaignPath: fixture.campaignFile,
          shardId,
          cwd: fixture.repository,
          env: testEnvironment,
        }).result.shard_id,
        shardId,
      );
    }

    assert.equal(invocations.length, 2);
    const firstArgs = invocations[0].args;
    assert.ok(firstArgs.includes("--safe-mode"));
    assert.ok(firstArgs.includes("dontAsk"));
    assert.ok(firstArgs.includes("Read,Glob,Grep,WebFetch"));
    assert.ok(!firstArgs.join(" ").includes("Edit"));
    assert.ok(!firstArgs.join(" ").includes("Write"));
    assert.ok(firstArgs.includes("--max-budget-usd"));
    assert.match(invocations[1].prompt, /source-analysis\.research\.json/);
    assert.ok(invocations[1].args.includes("Read"));
    assert.ok(!invocations[1].args.includes("Read,Glob,Grep,WebFetch"));
    assert.equal(invocations[1].cwd, fixture.passDirectory);

    const synthesis = JSON.parse(
      fs.readFileSync(resultPathFor(fixture.campaignFile, "synthesis")),
    );
    assert.equal(synthesis.research_version, "1");
    assert.deepEqual(Object.keys(synthesis.validation.repository).sort(), ["commit", "tree"]);
    assert.equal(synthesis.result.shard_id, "synthesis");
    assert.equal(run("git", ["status", "--porcelain"], fixture.repository), "");

    const dependencyPath = resultPathFor(fixture.campaignFile, "source-analysis");
    fs.appendFileSync(dependencyPath, " \n");
    assert.throws(
      () =>
        checkResearch({
          campaignPath: fixture.campaignFile,
          shardId: "synthesis",
          cwd: fixture.repository,
          env: testEnvironment,
        }),
      /research dependency evidence changed since publication/,
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("keeps validated repository research readable after the owning checkout moves", () => {
  const fixture = makeFixture();
  try {
    runResearch({
      campaignPath: fixture.campaignFile,
      shardId: "source-analysis",
      cwd: fixture.repository,
      env: testEnvironment,
      windowCheck: () => {},
      claudeInvoker: () =>
        envelope(structuredResult(fixture.campaign, "source-analysis")),
    });

    const relativeCampaign = path.relative(fixture.repository, fixture.campaignFile);
    const movedRepository = path.join(fixture.sandbox, "moved-repository");
    fs.renameSync(fixture.repository, movedRepository);
    const movedCampaign = path.join(movedRepository, relativeCampaign);

    assert.equal(
      checkResearch({
        campaignPath: movedCampaign,
        shardId: "source-analysis",
        cwd: movedRepository,
        env: testEnvironment,
      }).result.shard_id,
      "source-analysis",
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("refuses synthesis before dependencies without invoking Claude", () => {
  const fixture = makeFixture();
  let invoked = false;
  try {
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "synthesis",
          cwd: fixture.repository,
          env: testEnvironment,
          windowCheck: () => {},
          claudeInvoker: () => {
            invoked = true;
            return envelope(structuredResult(fixture.campaign, "synthesis"));
          },
        }),
      /missing validated dependency result: source-analysis/,
    );
    assert.equal(invoked, false);
    assert.equal(fs.existsSync(jobPathFor(fixture.campaignFile, "synthesis")), false);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("fails closed when structured output omits required source coverage", () => {
  const fixture = makeFixture();
  try {
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "source-analysis",
          cwd: fixture.repository,
          env: testEnvironment,
          windowCheck: () => {},
          claudeInvoker: () =>
            envelope(
              structuredResult(fixture.campaign, "source-analysis", {
                omitSourceId: "practitioner-source",
              }),
            ),
        }),
      /missing source coverage: practitioner-source/,
    );
    assert.equal(
      fs.existsSync(resultPathFor(fixture.campaignFile, "source-analysis")),
      false,
    );
    const job = JSON.parse(
      fs.readFileSync(jobPathFor(fixture.campaignFile, "source-analysis")),
    );
    assert.equal(job.state, "failed");
    assert.match(job.error, /missing source coverage/);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("prevents synthesis from promoting an unavailable dependency source", () => {
  const fixture = makeFixture();
  try {
    runResearch({
      campaignPath: fixture.campaignFile,
      shardId: "source-analysis",
      cwd: fixture.repository,
      env: testEnvironment,
      windowCheck: () => {},
      claudeInvoker: () =>
        envelope(
          structuredResult(fixture.campaign, "source-analysis", {
            unavailableSourceId: "practitioner-source",
          }),
        ),
    });
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "synthesis",
          cwd: fixture.repository,
          env: testEnvironment,
          windowCheck: () => {},
          claudeInvoker: () =>
            envelope(structuredResult(fixture.campaign, "synthesis")),
        }),
      /cannot promote unavailable source to used: practitioner-source/,
    );
    assert.equal(
      fs.existsSync(resultPathFor(fixture.campaignFile, "synthesis")),
      false,
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("rejects symlinked result directories before invoking Claude", () => {
  const fixture = makeFixture();
  const outside = path.join(fixture.sandbox, "outside-results");
  let invoked = false;
  try {
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(fixture.passDirectory, "results"), "dir");
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "source-analysis",
          cwd: fixture.repository,
          env: testEnvironment,
          windowCheck: () => {},
          claudeInvoker: () => {
            invoked = true;
            return envelope(structuredResult(fixture.campaign, "source-analysis"));
          },
        }),
      /research output directory must be a real directory/,
    );
    assert.equal(invoked, false);
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("refuses to invoke Claude when the execution window is denied", () => {
  const fixture = makeFixture();
  let invoked = false;
  try {
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "source-analysis",
          cwd: fixture.repository,
          env: testEnvironment,
          windowCheck: () => {
            throw new Error("Claude execution window denied");
          },
          claudeInvoker: () => {
            invoked = true;
            return envelope(structuredResult(fixture.campaign, "source-analysis"));
          },
        }),
      /Claude execution window denied/,
    );
    assert.equal(
      invoked,
      false,
      "Claude must not be invoked when the execution window is denied",
    );
    assert.equal(
      fs.existsSync(jobPathFor(fixture.campaignFile, "source-analysis")),
      false,
      "no running job is recorded when the window denies execution before launch",
    );
    assert.equal(
      fs.existsSync(resultPathFor(fixture.campaignFile, "source-analysis")),
      false,
      "no result is published when the window denies execution",
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("fails when the reported cost exceeds the budget", () => {
  const fixture = makeFixture();
  try {
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "source-analysis",
          cwd: fixture.repository,
          env: testEnvironment,
          windowCheck: () => {},
          claudeInvoker: () =>
            envelope(structuredResult(fixture.campaign, "source-analysis"), {
              total_cost_usd: 999,
            }),
        }),
      /exceeded budget/,
    );
    const job = JSON.parse(fs.readFileSync(jobPathFor(fixture.campaignFile, "source-analysis")));
    assert.equal(job.state, "failed");
    assert.match(job.error, /exceeded budget/);
    assert.equal(
      fs.existsSync(resultPathFor(fixture.campaignFile, "source-analysis")),
      false,
      "no result is published when the reported cost exceeds the budget",
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});
