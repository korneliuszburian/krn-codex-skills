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
  validateCampaign,
  validateResearchResult,
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
        allowed_paths: ["README.md"],
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
  assert.match(prompt, /stay under\s+the cited repository source's own allowed_paths/);
  assert.doesNotMatch(prompt, /evidence_gaps\[\]\.id/);
});

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function makeFixture({ gitlink = false, replacementObject = false, secretPath = false } = {}) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-research-test-"));
  const repository = path.join(sandbox, "repository");
  const sourceDirectory = path.join(sandbox, "sources");
  fs.mkdirSync(repository);
  fs.mkdirSync(sourceDirectory);
  fs.writeFileSync(path.join(repository, "README.md"), "fixed repository evidence\n");
  fs.writeFileSync(
    path.join(repository, ".gitattributes"),
    "README.md export-ignore\nSUBST.txt export-subst\n",
  );
  fs.writeFileSync(path.join(repository, "SUBST.txt"), "$Format:%H$\n");
  fs.writeFileSync(path.join(repository, "unlisted-private-notes.txt"), "not selected\n");
  if (secretPath) fs.writeFileSync(path.join(repository, ".env"), "TOKEN=do-not-stage\n");
  fs.symlinkSync("../../outside-secret", path.join(repository, "escaping-link"));
  run("git", ["init", "-q"], repository);
  run("git", ["config", "user.name", "Research Test"], repository);
  run("git", ["config", "user.email", "research@example.invalid"], repository);
  fs.mkdirSync(path.join(repository, ".krn", "runs"), { recursive: true });
  fs.writeFileSync(
    path.join(repository, ".krn", "runs", ".gitignore"),
    "*\n!.gitignore\n",
  );
  run(
    "git",
    [
      "add",
      "README.md",
      ".gitattributes",
      "SUBST.txt",
      "unlisted-private-notes.txt",
      "escaping-link",
      ".krn/runs/.gitignore",
      ...(secretPath ? [".env"] : []),
    ],
    repository,
  );
  run("git", ["commit", "-qm", "test fixture"], repository);
  if (gitlink) {
    const dependencyCommit = run("git", ["rev-parse", "HEAD"], repository);
    const dependencyCheckout = path.join(repository, "vendor", "dependency");
    fs.mkdirSync(path.dirname(dependencyCheckout), { recursive: true });
    run("git", ["clone", "-q", repository, dependencyCheckout], sandbox);
    run(
      "git",
      [
        "update-index",
        "--add",
        "--cacheinfo",
        `160000,${dependencyCommit},vendor/dependency`,
      ],
      repository,
    );
    run("git", ["commit", "-qm", "add gitlink"], repository);
  }
  const commit = run("git", ["rev-parse", "HEAD"], repository);
  if (replacementObject) {
    const originalBlob = run(
      "git",
      ["rev-parse", "HEAD:README.md"],
      repository,
    );
    const replacementFile = path.join(sandbox, "replacement-readme.txt");
    fs.writeFileSync(replacementFile, "replacement object evidence\n");
    const replacementBlob = run(
      "git",
      ["hash-object", "-w", replacementFile],
      repository,
    );
    run("git", ["replace", originalBlob, replacementBlob], repository);
  }
  const passDirectory = prepareArtifactDirectory({
    slug: "research-test",
    role: "research",
    cwd: repository,
  });

  const transcript = path.join(sourceDirectory, "transcript.txt");
  fs.writeFileSync(transcript, "fixed transcript evidence\n");
  fs.writeFileSync(
    path.join(sourceDirectory, "undeclared-sibling.txt"),
    "must never reach a shard\n",
  );
  fs.writeFileSync(
    path.join(repository, ".krn", "runs", "ignored-sibling.txt"),
    "must not enter the fixed repository snapshot\n",
  );
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
        allowed_paths: [
          ".gitattributes",
          ".krn/runs/.gitignore",
          "README.md",
          "SUBST.txt",
          "escaping-link",
          ...(gitlink ? ["vendor"] : []),
          ...(secretPath ? [".env"] : []),
        ],
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
  return {
    sandbox,
    repository,
    passDirectory,
    campaignFile,
    campaign,
    transcript,
  };
}

function structuredResult(
  campaign,
  shardId,
  {
    omitSourceId,
    unavailableSourceId,
    citationLocator = "README.md:1",
    citationSourceId,
  } = {},
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
            source_id: citationSourceId ?? shard.source_ids[0],
            locator: citationLocator,
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

function repositoryCitationCampaign() {
  return validateCampaign({
    campaign_version: "1",
    campaign_id: "citation-boundary",
    objective: "Check repository citation provenance.",
    sources: [
      {
        id: "public-source",
        kind: "repository",
        locator: ".",
        revision: "a".repeat(40),
        allowed_paths: ["README.md"],
        authority: "local",
        purpose: "Public repository evidence.",
        required: true,
      },
      {
        id: "private-source",
        kind: "repository",
        locator: ".",
        revision: "a".repeat(40),
        allowed_paths: ["private/customer-notes.txt"],
        authority: "local",
        purpose: "Separately bounded repository evidence.",
        required: true,
      },
    ],
    shards: [
      {
        id: "source-analysis",
        kind: "research",
        objective: "Inspect both bounded sources.",
        source_ids: ["public-source", "private-source"],
        depends_on: [],
        deliverable: "Bounded citations.",
      },
    ],
    human_decisions: ["Disposition remains local."],
    does_not_prove: ["Citation validation does not prove the claim."],
  });
}

test("rejects a repository citation outside every allowed path", () => {
  const campaign = repositoryCitationCampaign();
  assert.throws(
    () =>
      validateResearchResult(
        structuredResult(campaign, "source-analysis", {
          citationLocator: "docs/unlisted.md:1",
          citationSourceId: "public-source",
        }),
        campaign,
        "source-analysis",
      ),
    /outside source public-source allowed_paths/,
  );
});

test("requires canonical line-qualified repository citation locators", () => {
  const campaign = repositoryCitationCampaign();
  assert.throws(
    () =>
      validateResearchResult(
        structuredResult(campaign, "source-analysis", {
          citationLocator: "README.md",
          citationSourceId: "public-source",
        }),
        campaign,
        "source-analysis",
      ),
    /must use <path>:<line>\[-<line>\]/,
  );
});

test("rejects cross-source repository citation attribution", () => {
  const campaign = repositoryCitationCampaign();
  assert.throws(
    () =>
      validateResearchResult(
        structuredResult(campaign, "source-analysis", {
          citationLocator: "private/customer-notes.txt:1",
          citationSourceId: "public-source",
        }),
        campaign,
        "source-analysis",
      ),
    /outside source public-source allowed_paths/,
  );
});

test("binds a union-staged repository citation to its own source", () => {
  const campaign = repositoryCitationCampaign();
  const result = structuredResult(campaign, "source-analysis", {
    citationLocator: "private/customer-notes.txt:4-8",
    citationSourceId: "private-source",
  });
  assert.equal(
    validateResearchResult(result, campaign, "source-analysis"),
    result,
  );
});

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

function filesBelow(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory).sort()) {
      const candidate = path.join(directory, entry);
      const metadata = fs.lstatSync(candidate);
      if (metadata.isDirectory()) visit(candidate);
      else files.push(path.relative(root, candidate));
    }
  };
  visit(root);
  return files;
}

function captureInvocation(invocation) {
  const files = filesBelow(invocation.cwd);
  return {
    ...invocation,
    mode: fs.statSync(invocation.cwd).mode & 0o777,
    files,
    bytes: new Map(
      files.map((file) => [file, fs.readFileSync(path.join(invocation.cwd, file))]),
    ),
  };
}

function transportNameOf(invocation) {
  const names = new Set(
    invocation.files.map((file) => file.split(path.sep)[0]),
  );
  assert.equal(names.size, 1);
  const [name] = names;
  assert.match(name, /^\.second-opinion-transport-[a-f0-9]{16}$/);
  return name;
}

function transportBytes(invocation, relativePath) {
  return invocation.bytes.get(
    path.join(transportNameOf(invocation), relativePath),
  );
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

test("repository research requires literal bounded allowed paths", () => {
  const fixture = makeFixture();
  try {
    for (const allowedPaths of [undefined, [], ["."], ["skills/**"], ["../outside"]]) {
      const candidate = structuredClone(fixture.campaign);
      const repositorySource = candidate.sources.find(
        (source) => source.kind === "repository",
      );
      if (allowedPaths === undefined) delete repositorySource.allowed_paths;
      else repositorySource.allowed_paths = allowedPaths;
      assert.throws(() => validateCampaign(candidate), /allowed_paths/);
    }
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

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
          invocations.push(captureInvocation(invocation));
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
    assert.equal(firstArgs.includes("--add-dir"), false);
    assert.equal(invocations[0].mode, 0o700);
    assert.equal(isWithin(fixture.repository, invocations[0].cwd), false);
    assert.equal(isWithin(fixture.passDirectory, invocations[0].cwd), false);
    const researchTransport = transportNameOf(invocations[0]);
    assert.deepEqual(
      invocations[0].files.map((file) =>
        file.slice(researchTransport.length + 1),
      ),
      [
        "artifacts/video-transcript/transcript.txt",
        "repository/.gitattributes",
        "repository/.krn/runs/.gitignore",
        "repository/README.md",
        "repository/SUBST.txt",
        "repository/escaping-link",
      ],
    );
    assert.equal(
      transportBytes(
        invocations[0],
        "artifacts/video-transcript/transcript.txt",
      ).toString("utf8"),
      "fixed transcript evidence\n",
    );
    assert.equal(
      transportBytes(invocations[0], "repository/README.md").toString("utf8"),
      "fixed repository evidence\n",
    );
    assert.equal(
      transportBytes(invocations[0], "repository/SUBST.txt").toString("utf8"),
      "$Format:%H$\n",
    );
    assert.equal(
      transportBytes(invocations[0], "repository/escaping-link").toString("utf8"),
      "../../outside-secret",
    );
    assert.ok(
      invocations[0].prompt.includes(
        `"transport_locator": ${JSON.stringify(
          path.join(
            invocations[0].cwd,
            researchTransport,
            "repository",
          ),
        )}`,
      ),
    );
    assert.ok(
      invocations[0].prompt.includes(
        `"transport_locator": ${JSON.stringify(
          path.join(
            invocations[0].cwd,
            researchTransport,
            "artifacts",
            "video-transcript",
            "transcript.txt",
          ),
        )}`,
      ),
    );
    assert.equal(invocations[0].prompt.includes(fixture.passDirectory), false);
    assert.match(
      invocations[1].prompt,
      /dependencies\/source-analysis\.research\.json/,
    );
    assert.equal(
      invocations[1].prompt.includes("validated dependency results listed below"),
      false,
    );
    assert.ok(invocations[1].args.includes("Read"));
    assert.ok(!invocations[1].args.includes("Read,Glob,Grep,WebFetch"));
    assert.equal(invocations[1].args.includes("--add-dir"), false);
    assert.equal(invocations[1].mode, 0o700);
    assert.equal(isWithin(fixture.repository, invocations[1].cwd), false);
    assert.equal(isWithin(fixture.passDirectory, invocations[1].cwd), false);
    const synthesisTransport = transportNameOf(invocations[1]);
    assert.deepEqual(
      invocations[1].files.map((file) =>
        file.slice(synthesisTransport.length + 1),
      ),
      ["dependencies/source-analysis.research.json"],
    );
    assert.equal(invocations[1].prompt.includes(fixture.passDirectory), false);
    assert.match(
      invocations[1].prompt,
      /Never put a disposable transport_locator in the result/,
    );
    assert.equal(fs.existsSync(invocations[0].cwd), false);
    assert.equal(fs.existsSync(invocations[1].cwd), false);

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
      /research result bytes changed since publication: source-analysis/,
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("materializes pinned blobs with Git replacement objects disabled", () => {
  const fixture = makeFixture({ replacementObject: true });
  let captured;
  try {
    runResearch({
      campaignPath: fixture.campaignFile,
      shardId: "source-analysis",
      cwd: fixture.repository,
      env: testEnvironment,
      windowCheck: () => {},
      claudeInvoker: (invocation) => {
        captured = captureInvocation(invocation);
        return envelope(structuredResult(fixture.campaign, "source-analysis"));
      },
    });
    assert.equal(
      transportBytes(captured, "repository/README.md").toString("utf8"),
      "fixed repository evidence\n",
    );
    assert.equal(fs.existsSync(captured.cwd), false);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("rejects an allowed secret-shaped repository path before invoking Claude", () => {
  const fixture = makeFixture({ secretPath: true });
  let invoked = false;
  try {
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
      /repository snapshot selects a denied secret-shaped path: \.env/,
    );
    assert.equal(invoked, false);
    assert.equal(
      fs.existsSync(resultPathFor(fixture.campaignFile, "source-analysis")),
      false,
    );
    const job = JSON.parse(
      fs.readFileSync(jobPathFor(fixture.campaignFile, "source-analysis")),
    );
    assert.equal(job.state, "failed");
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("rejects a temporary root inside the repository before invoking Claude", () => {
  const fixture = makeFixture();
  const temporaryDirectory = path.join(fixture.repository, ".krn", "runs");
  const before = fs
    .readdirSync(temporaryDirectory)
    .filter((entry) => entry.startsWith("second-opinion-research-input-"))
    .sort();
  let invoked = false;
  try {
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "source-analysis",
          cwd: fixture.repository,
          env: testEnvironment,
          temporaryDirectory,
          windowCheck: () => {},
          claudeInvoker: () => {
            invoked = true;
            return envelope(structuredResult(fixture.campaign, "source-analysis"));
          },
        }),
      /research input root overlaps a protected source/,
    );
    assert.equal(invoked, false);
    assert.deepEqual(
      fs
        .readdirSync(temporaryDirectory)
        .filter((entry) => entry.startsWith("second-opinion-research-input-"))
        .sort(),
      before,
    );
    const job = JSON.parse(
      fs.readFileSync(jobPathFor(fixture.campaignFile, "source-analysis")),
    );
    assert.equal(job.state, "failed");
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("rejects a temporary root inside an unselected artifact parent", () => {
  const fixture = makeFixture();
  const unselectedParent = path.join(fixture.sandbox, "unselected-artifact");
  fs.mkdirSync(unselectedParent);
  const unselectedArtifact = path.join(unselectedParent, "source.txt");
  fs.writeFileSync(unselectedArtifact, "other shard only\n");
  fixture.campaign.sources.push({
    id: "unselected-artifact",
    kind: "artifact",
    locator: unselectedArtifact,
    revision: createHash("sha256")
      .update(fs.readFileSync(unselectedArtifact))
      .digest("hex"),
    authority: "practitioner",
    purpose: "Belongs to another research shard.",
    required: false,
  });
  fs.writeFileSync(
    fixture.campaignFile,
    `${JSON.stringify(fixture.campaign, null, 2)}\n`,
  );
  let invoked = false;
  try {
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "source-analysis",
          cwd: fixture.repository,
          env: testEnvironment,
          temporaryDirectory: unselectedParent,
          windowCheck: () => {},
          claudeInvoker: () => {
            invoked = true;
            return envelope(structuredResult(fixture.campaign, "source-analysis"));
          },
        }),
      /research input root overlaps a protected source/,
    );
    assert.equal(invoked, false);
    assert.equal(
      fs
        .readdirSync(unselectedParent)
        .some((entry) => entry.startsWith("second-opinion-research-input-")),
      false,
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("rejects a temporary root below an unrelated Git worktree", () => {
  const fixture = makeFixture();
  const unrelatedRepository = path.join(fixture.sandbox, "unrelated-repository");
  const temporaryDirectory = path.join(unrelatedRepository, "temporary");
  fs.mkdirSync(temporaryDirectory, { recursive: true });
  run("git", ["init", "-q"], unrelatedRepository);
  let invoked = false;
  try {
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "source-analysis",
          cwd: fixture.repository,
          env: testEnvironment,
          temporaryDirectory,
          windowCheck: () => {},
          claudeInvoker: () => {
            invoked = true;
            return envelope(structuredResult(fixture.campaign, "source-analysis"));
          },
        }),
      /research input root is inside a Git worktree/,
    );
    assert.equal(invoked, false);
    assert.equal(
      fs
        .readdirSync(temporaryDirectory)
        .some((entry) => entry.startsWith("second-opinion-research-input-")),
      false,
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("rejects a research citation into its disposable transport root", () => {
  const fixture = makeFixture();
  let stagedRoot;
  try {
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "source-analysis",
          cwd: fixture.repository,
          env: testEnvironment,
          windowCheck: () => {},
          claudeInvoker: (invocation) => {
            stagedRoot = invocation.cwd;
            return envelope(
              structuredResult(fixture.campaign, "source-analysis", {
                citationLocator: path.join(
                  invocation.cwd,
                  "repository",
                  "README.md:1",
                ),
              }),
            );
          },
        }),
      /cites a disposable research transport path/,
    );
    assert.equal(fs.existsSync(stagedRoot), false);
    assert.equal(
      fs.existsSync(resultPathFor(fixture.campaignFile, "source-analysis")),
      false,
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("rejects a synthesis citation into its disposable dependency copy", () => {
  const fixture = makeFixture();
  let stagedRoot;
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
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "synthesis",
          cwd: fixture.repository,
          env: testEnvironment,
          windowCheck: () => {},
          claudeInvoker: (invocation) => {
            stagedRoot = invocation.cwd;
            const [transportName] = fs.readdirSync(invocation.cwd);
            return envelope(
              structuredResult(fixture.campaign, "synthesis", {
                citationLocator: path.join(
                  transportName,
                  "dependencies",
                  "source-analysis.research.json",
                ),
              }),
            );
          },
        }),
      /cites a disposable research transport path/,
    );
    assert.equal(fs.existsSync(stagedRoot), false);
    assert.equal(
      fs.existsSync(resultPathFor(fixture.campaignFile, "synthesis")),
      false,
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("rejects a result edited after publication before synthesis starts", () => {
  const fixture = makeFixture();
  let invoked = false;
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
    const dependency = resultPathFor(fixture.campaignFile, "source-analysis");
    const edited = JSON.parse(fs.readFileSync(dependency, "utf8"));
    edited.result.scope_summary = "Edited after the terminal job sealed it.";
    fs.writeFileSync(dependency, `${JSON.stringify(edited, null, 2)}\n`);

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
      /research result bytes changed since publication: source-analysis/,
    );
    assert.equal(invoked, false);
    assert.equal(
      fs.existsSync(jobPathFor(fixture.campaignFile, "synthesis")),
      false,
    );
    assert.equal(
      fs.existsSync(resultPathFor(fixture.campaignFile, "synthesis")),
      false,
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("fails synthesis if a validated dependency changes during invocation", () => {
  const fixture = makeFixture();
  let stagedRoot;
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
    const dependency = resultPathFor(fixture.campaignFile, "source-analysis");
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "synthesis",
          cwd: fixture.repository,
          env: testEnvironment,
          windowCheck: () => {},
          claudeInvoker: (invocation) => {
            stagedRoot = invocation.cwd;
            fs.appendFileSync(dependency, " \n");
            return envelope(structuredResult(fixture.campaign, "synthesis"));
          },
        }),
      /validated dependency result changed during the pass: source-analysis/,
    );
    assert.equal(fs.existsSync(stagedRoot), false);
    assert.equal(
      fs.existsSync(resultPathFor(fixture.campaignFile, "synthesis")),
      false,
    );
    const job = JSON.parse(
      fs.readFileSync(jobPathFor(fixture.campaignFile, "synthesis")),
    );
    assert.equal(job.state, "failed");
    assert.match(job.error, /validated dependency result changed during the pass/);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("fails research if a declared artifact changes during invocation", () => {
  const fixture = makeFixture();
  let stagedRoot;
  try {
    assert.throws(
      () =>
        runResearch({
          campaignPath: fixture.campaignFile,
          shardId: "source-analysis",
          cwd: fixture.repository,
          env: testEnvironment,
          windowCheck: () => {},
          claudeInvoker: (invocation) => {
            stagedRoot = invocation.cwd;
            fs.appendFileSync(fixture.transcript, "changed\n");
            return envelope(structuredResult(fixture.campaign, "source-analysis"));
          },
        }),
      /artifact source changed during the pass: video-transcript/,
    );
    assert.equal(fs.existsSync(stagedRoot), false);
    assert.equal(
      fs.existsSync(resultPathFor(fixture.campaignFile, "source-analysis")),
      false,
    );
    const job = JSON.parse(
      fs.readFileSync(jobPathFor(fixture.campaignFile, "source-analysis")),
    );
    assert.equal(job.state, "failed");
    assert.match(job.error, /artifact source changed during the pass/);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("fails closed on gitlinks before invoking Claude", () => {
  const fixture = makeFixture({ gitlink: true });
  let invoked = false;
  try {
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
      /repository snapshot contains an unsupported gitlink/,
    );
    assert.equal(invoked, false);
    assert.equal(
      fs.existsSync(resultPathFor(fixture.campaignFile, "source-analysis")),
      false,
    );
    const job = JSON.parse(
      fs.readFileSync(jobPathFor(fixture.campaignFile, "source-analysis")),
    );
    assert.equal(job.state, "failed");
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
