import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXCLUDED_TOP_LEVEL = new Set([
  ".git",
  ".krn",
  ".remember",
  ".tmp",
  "build",
  "dist",
  "node_modules",
  "tmp",
]);

function withFixture(run) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-validate-test-"));
  const fixture = path.join(sandbox, "repo");
  try {
    fs.cpSync(REPO, fixture, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      filter(source) {
        const relative = path.relative(REPO, source);
        if (!relative) return true;
        return !EXCLUDED_TOP_LEVEL.has(relative.split(path.sep)[0]);
      },
    });
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

test("rejects a malformed canonical README skill row", () => {
  withFixture((fixture) => {
    const readme = path.join(fixture, "README.md");
    const source = fs.readFileSync(readme, "utf8");
    const changed = source.replace("| [`code-review`]", "BROKEN [`code-review`]");
    assert.notEqual(changed, source, "fixture must contain the code-review row");
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
    manifest.retired_skills[0].reason = "not part of the canonical schema";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = validate(fixture);
    assert.notEqual(result.status, 0);
    assert.match(
      diagnostics(result),
      /retired skill reviewer-handoff must contain only name and replacement/,
    );
  });
});

test("rejects an unknown retired-skill replacement", () => {
  withFixture((fixture) => {
    const manifestPath = path.join(fixture, "skills", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.retired_skills[0].replacement = "missing-workflow";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = validate(fixture);
    assert.notEqual(result.status, 0);
    assert.match(
      diagnostics(result),
      /retired skill reviewer-handoff has unknown replacement missing-workflow/,
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
    const wayfinder = triggerCases.cases.find(
      (entry) =>
        entry.expected_skills?.includes("wayfinder") &&
        entry.prompt.includes("$wayfinder"),
    );
    assert.ok(wayfinder, "fixture must contain an explicit wayfinder positive eval");
    wayfinder.prompt = wayfinder.prompt.replace("$wayfinder", "wayfinder");
    fs.writeFileSync(evalPath, `${JSON.stringify(triggerCases, null, 2)}\n`);

    const result = validate(fixture);
    assert.notEqual(result.status, 0);
    assert.match(
      diagnostics(result),
      /explicit-only expected skill wayfinder requires exact \$wayfinder attachment/,
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
