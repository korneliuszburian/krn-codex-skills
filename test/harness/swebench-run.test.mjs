import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";

// The runner is imported lazily so the base overlay reports a real assertion
// failure, not a module-load setup error, when it does not exist yet.
const loadRunner = async () => {
  try {
    return await import("../../scripts/harness/swebench-run.mjs");
  } catch {
    return null;
  }
};

const EVENTS = [
  JSON.stringify({ type: "step_start" }),
  JSON.stringify({ type: "step_finish", part: { tokens: { total: 100 } } }),
  "not json",
  JSON.stringify({ type: "step_finish", part: { tokens: { total: 25 } } }),
].join("\n");

test("the runner exposes the lane set and the pure helpers", async () => {
  const runner = await loadRunner();
  assert.ok(runner, "scripts/harness/swebench-run.mjs must exist");
  assert.deepEqual(Object.keys(runner.LANES).sort(), ["full", "no-brief", "no-hooks", "no-memory", "no-skills", "vanilla"]);
  assert.equal(runner.parseTokens(EVENTS), 125);
  assert.deepEqual(runner.buildPredictions("full", [{ instanceId: "a__a-1", patch: "diff" }]), [
    { instance_id: "a__a-1", model_name_or_path: "krn-full", model_patch: "diff" },
  ]);
  assert.deepEqual(runner.resolvedRate({ resolved: ["a"], unresolved: ["b", "c"] }), { resolved: 1, total: 3, rate: 1 / 3 });
  assert.deepEqual(runner.resolvedRate({}), { resolved: 0, total: 0, rate: 0 });
});

test("the vanilla lane mounts no skills and no KRN config, the full lane mounts both", async () => {
  const runner = await loadRunner();
  assert.ok(runner, "scripts/harness/swebench-run.mjs must exist");
  const home = homedir();
  const vanilla = runner.laneMounts(runner.LANES.vanilla, home).join(" ");
  const full = runner.laneMounts(runner.LANES.full, home).join(" ");
  assert.ok(!vanilla.includes(`${path.join(home, ".agents")}`), "vanilla must not mount the skills");
  assert.ok(!vanilla.includes(`${path.join(home, ".config", "opencode")}:`), "vanilla must not mount the KRN config");
  assert.ok(full.includes(`${path.join(home, ".agents")}`), "full must mount the skills");
  assert.ok(full.includes(`${path.join(home, ".config", "opencode")}:`), "full must mount the KRN config");
});

test("the container command runs the agent and captures the git diff", async () => {
  const runner = await loadRunner();
  assert.ok(runner, "scripts/harness/swebench-run.mjs must exist");
  const args = runner.containerArgs({ image: "img:latest", mounts: ["-v", "a:b"], problemFile: "/tmp/p.txt", outDir: "/tmp/out" });
  const joined = args.join(" ");
  assert.equal(args[0], "run");
  assert.ok(joined.includes("img:latest"));
  assert.ok(joined.includes("/tmp/p.txt:/problem.txt:ro"));
  assert.ok(joined.includes("/tmp/out:/out"));
  assert.ok(joined.includes("git diff > /out/patch.diff"));
  assert.ok(joined.includes("/opencode/bin/opencode run"));
});
