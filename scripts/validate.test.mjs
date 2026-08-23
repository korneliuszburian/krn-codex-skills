import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function gitVisiblePaths(repository) {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repository, encoding: "utf8" },
  );
  assert.equal(result.status, 0, diagnostics(result));
  const visible = new Set([""]);
  for (const file of result.stdout.split("\0").filter(Boolean)) {
    let current = file;
    while (current && current !== ".") {
      visible.add(current);
      current = path.dirname(current);
    }
  }
  return visible;
}

const VISIBLE_REPOSITORY_PATHS = gitVisiblePaths(REPO);

function withFixture(run) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-validate-test-"));
  const fixture = path.join(sandbox, "repo");
  try {
    fs.cpSync(REPO, fixture, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      filter(source) {
        return VISIBLE_REPOSITORY_PATHS.has(path.relative(REPO, source));
      },
    });
    const initialized = spawnSync("git", ["init", "--quiet"], {
      cwd: fixture,
      encoding: "utf8",
    });
    assert.equal(initialized.status, 0, diagnostics(initialized));
    const staged = spawnSync("git", ["add", "-A"], {
      cwd: fixture,
      encoding: "utf8",
    });
    assert.equal(staged.status, 0, diagnostics(staged));
    const configuredEmail = spawnSync(
      "git",
      ["config", "user.email", "validate-fixture@example.invalid"],
      { cwd: fixture, encoding: "utf8" },
    );
    assert.equal(configuredEmail.status, 0, diagnostics(configuredEmail));
    const configuredName = spawnSync(
      "git",
      ["config", "user.name", "validate fixture"],
      { cwd: fixture, encoding: "utf8" },
    );
    assert.equal(configuredName.status, 0, diagnostics(configuredName));
    const committed = spawnSync("git", ["commit", "--quiet", "-m", "fixture"], {
      cwd: fixture,
      encoding: "utf8",
    });
    assert.equal(committed.status, 0, diagnostics(committed));
    const fixtureHead = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: fixture,
      encoding: "utf8",
    });
    assert.equal(fixtureHead.status, 0, diagnostics(fixtureHead));
    const experimentManifest = path.join(
      fixture,
      "evals",
      "experiments",
      "2026-08-19-evidence-lab-v1",
      "manifest.json",
    );
    const manifest = JSON.parse(fs.readFileSync(experimentManifest, "utf8"));
    manifest.target.base_commit = fixtureHead.stdout.trim();
    manifest.target.head = fixtureHead.stdout.trim();
    fs.writeFileSync(experimentManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    const restagedManifest = spawnSync("git", ["add", "--", "evals/experiments/2026-08-19-evidence-lab-v1/manifest.json"], {
      cwd: fixture,
      encoding: "utf8",
    });
    assert.equal(restagedManifest.status, 0, diagnostics(restagedManifest));
    return run(fixture);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

function validate(fixture) {
  return spawnSync(process.execPath, ["scripts/validate.mjs"], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function diagnostics(result) {
  return `${result.stdout}\n${result.stderr}`;
}

test("accepts an unmodified isolated repository fixture", () => {
  withFixture((fixture) => {
    const result = validate(fixture);
    assert.equal(result.status, 0, diagnostics(result));
  });
});

test("fixture inventory excludes Git-ignored private state", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-visible-files-test-"));
  try {
    const initialized = spawnSync("git", ["init", "--quiet"], {
      cwd: sandbox,
      encoding: "utf8",
    });
    assert.equal(initialized.status, 0, diagnostics(initialized));
    fs.writeFileSync(path.join(sandbox, ".gitignore"), "private/\n.env*\n");
    fs.writeFileSync(path.join(sandbox, "tracked.md"), "tracked\n");
    fs.writeFileSync(path.join(sandbox, "visible.md"), "visible untracked\n");
    fs.mkdirSync(path.join(sandbox, "private"));
    fs.writeFileSync(path.join(sandbox, "private", "review.md"), "private review\n");
    fs.writeFileSync(path.join(sandbox, ".env.local"), "SECRET=fixture\n");
    const staged = spawnSync("git", ["add", ".gitignore", "tracked.md"], {
      cwd: sandbox,
      encoding: "utf8",
    });
    assert.equal(staged.status, 0, diagnostics(staged));

    const visible = gitVisiblePaths(sandbox);
    assert.ok(visible.has("tracked.md"));
    assert.ok(visible.has("visible.md"));
    assert.ok(!visible.has("private/review.md"));
    assert.ok(!visible.has(".env.local"));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("rejects a malformed canonical README skill row", () => {
  withFixture((fixture) => {
    const readme = path.join(fixture, "README.md");
    const source = fs.readFileSync(readme, "utf8");
    const changed = source.replace("| [`target-repo-work`]", "BROKEN [`target-repo-work`]");
    assert.notEqual(changed, source, "fixture must contain the target-repo-work row");
    fs.writeFileSync(readme, changed);

    const result = validate(fixture);
    assert.notEqual(result.status, 0);
    assert.match(diagnostics(result), /malformed Skills table row/);
  });
});

test("rejects extra retired-skill metadata", () => {
  withFixture((fixture) => {
    const manifestPath = path.join(fixture, "skills", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const retired = manifest.retired_skills.find(
      (skill) => skill.name === "second-opinion-review",
    );
    assert.ok(retired, "fixture must retain the Claude second-opinion tombstone");
    retired.reason = "not part of the canonical schema";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = validate(fixture);
    assert.notEqual(result.status, 0);
    assert.match(
      diagnostics(result),
      /retired skill second-opinion-review must contain only name, owner, and replacement/,
    );
  });
});

test("rejects an unknown retired-skill replacement", () => {
  withFixture((fixture) => {
    const manifestPath = path.join(fixture, "skills", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const retired = manifest.retired_skills.find(
      (skill) => skill.name === "second-opinion-review",
    );
    assert.ok(retired, "fixture must retain the Claude second-opinion tombstone");
    retired.replacement = "missing-workflow";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = validate(fixture);
    assert.notEqual(result.status, 0);
    assert.match(
      diagnostics(result),
      /retired skill second-opinion-review has unknown replacement missing-workflow/,
    );
  });
});

test("rejects broken Markdown links and unclosed semantic XML", () => {
  withFixture((fixture) => {
    const research = path.join(fixture, "docs", "research", "orchestration.md");
    fs.appendFileSync(
      research,
      "\n[missing evidence](./does-not-exist.md)\n<unclosed-contract>\n",
    );

    const result = validate(fixture);
    assert.notEqual(result.status, 0);
    assert.match(diagnostics(result), /broken Markdown link/);
    assert.match(diagnostics(result), /unclosed <unclosed-contract>/);
  });
});

test("requires the exact attachment token for every explicit-only positive eval", () => {
  withFixture((fixture) => {
    const evalPath = path.join(fixture, "evals", "trigger-cases.json");
    const triggerCases = JSON.parse(fs.readFileSync(evalPath, "utf8"));
    const secondOpinion = triggerCases.cases.find(
      (entry) =>
        entry.expected_skills?.includes("opencode-second-opinion") &&
        entry.prompt.includes("$opencode-second-opinion"),
    );
    assert.ok(
      secondOpinion,
      "fixture must contain an explicit opencode-second-opinion positive eval",
    );
    secondOpinion.prompt = secondOpinion.prompt.replace(
      "$opencode-second-opinion",
      "opencode-second-opinion",
    );
    fs.writeFileSync(evalPath, `${JSON.stringify(triggerCases, null, 2)}\n`);

    const result = validate(fixture);
    assert.notEqual(result.status, 0);
    assert.match(
      diagnostics(result),
      /explicit-only expected skill opencode-second-opinion requires exact \$opencode-second-opinion attachment/,
    );
  });
});

test("keeps retired private review namespaces ignored during v1 migration", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-ignore-test-"));
  try {
    fs.copyFileSync(path.join(REPO, ".gitignore"), path.join(sandbox, ".gitignore"));
    for (const relative of [
      "reviews/legacy/pass.md",
      "review-artifacts/legacy/pass.md",
      "docs/visible.md",
    ]) {
      fs.mkdirSync(path.dirname(path.join(sandbox, relative)), { recursive: true });
      fs.writeFileSync(path.join(sandbox, relative), "fixture\n");
    }
    const initialized = spawnSync("git", ["init", "--quiet"], {
      cwd: sandbox,
      encoding: "utf8",
    });
    assert.equal(initialized.status, 0, diagnostics(initialized));

    for (const relative of ["reviews/legacy/pass.md", "review-artifacts/legacy/pass.md"]) {
      const ignored = spawnSync("git", ["check-ignore", "--quiet", "--", relative], {
        cwd: sandbox,
        encoding: "utf8",
      });
      assert.equal(ignored.status, 0, `${relative} must remain ignored`);
    }
    const visible = spawnSync("git", ["check-ignore", "--quiet", "--", "docs/visible.md"], {
      cwd: sandbox,
      encoding: "utf8",
    });
    assert.equal(visible.status, 1, "ordinary documentation must remain visible to Git");
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
