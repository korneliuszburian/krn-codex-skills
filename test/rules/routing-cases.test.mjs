import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { skillMetadata } from "../../scripts/lib/install/skill-metadata.mjs";
import * as skillRules from "../../scripts/lib/rules/skill-rules.mjs";

// The routing observer lives in the shared skill-rules module. It is loaded as a
// namespace so the same observer can run at the base revision, where the routing
// exports are absent: every case then fails inside its callback instead of
// erroring the whole file as a setup fault.
function routingCaseErrors(...args) {
  if (typeof skillRules.routingCaseErrors !== "function") {
    throw new Error("scripts/lib/rules/skill-rules.mjs must export routingCaseErrors");
  }
  return skillRules.routingCaseErrors(...args);
}

function triggerCollisionWarnings(...args) {
  if (typeof skillRules.triggerCollisionWarnings !== "function") {
    throw new Error("scripts/lib/rules/skill-rules.mjs must export triggerCollisionWarnings");
  }
  return skillRules.triggerCollisionWarnings(...args);
}

function verbObjectTriggers(...args) {
  if (typeof skillRules.verbObjectTriggers !== "function") {
    throw new Error("scripts/lib/rules/skill-rules.mjs must export verbObjectTriggers");
  }
  return skillRules.verbObjectTriggers(...args);
}

const root = fileURLToPath(new URL("../..", import.meta.url));

function repositorySkills() {
  const manifest = JSON.parse(readFileSync(join(root, "skills", "manifest.json"), "utf8"));
  return manifest.skills.map((entry) => {
    const fields = skillMetadata(join(root, entry.path, "SKILL.md"));
    return {
      name: entry.name,
      implicit: entry.implicit !== false,
      description: fields?.description ?? "",
    };
  });
}

// The retained per-question record: canonical trigger phrases, synonyms, nearest
// negatives, and no-owner requests for the implicit skills. Each trigger is a
// fragment of the owner's description, so the set is evaluated against the
// descriptions rather than against a router.
const ROUTING_CASES = [
  { id: "delivery-loop-canonical", category: "canonical", query: "Carry this accepted outcome autonomously through review and publication.", owner: "delivery-loop", trigger: "one accepted outcome" },
  { id: "delivery-loop-synonym", category: "synonym", query: "Own the whole lifecycle end to end until the outcome is done.", owner: "delivery-loop", trigger: "one accepted outcome" },
  { id: "source-to-decision-canonical", category: "canonical", query: "Turn this paper into an owned engineering decision.", owner: "source-to-decision", trigger: "owned engineering decision" },
  { id: "source-to-decision-synonym", category: "synonym", query: "Adopt a mechanism from an external source into a named local decision.", owner: "source-to-decision", trigger: "owned engineering decision" },
  { id: "slice-work-canonical", category: "canonical", query: "Break this settled spec into vertical slices before implementation.", owner: "slice-work", trigger: "vertical slices" },
  { id: "slice-work-synonym", category: "synonym", query: "Cut an accepted multi-change spec into expand-contract stages.", owner: "slice-work", trigger: "vertical slices" },
  { id: "target-repo-work-canonical", category: "canonical", query: "Repair a repository other than the active source checkout.", owner: "target-repo-work", trigger: "other than the active source checkout" },
  { id: "target-repo-work-synonym", category: "synonym", query: "Inspect and test a different checkout under explicit write authority.", owner: "target-repo-work", trigger: "other than the active source checkout" },
  { id: "typescript-engineering-canonical", category: "canonical", query: "Sharpen the TypeScript inference on this public API.", owner: "typescript-engineering", trigger: "sharpen typescript inference" },
  { id: "typescript-engineering-synonym", category: "synonym", query: "Widen the type-level proof for this module boundary.", owner: "typescript-engineering", trigger: "type-level proof" },
  { id: "managing-codex-capabilities-canonical", category: "canonical", query: "Audit the global Codex skills and plugins through the capability catalog.", owner: "managing-codex-capabilities", trigger: "global codex skills" },
  { id: "managing-codex-capabilities-synonym", category: "synonym", query: "Enable or disable a token-heavy global integration.", owner: "managing-codex-capabilities", trigger: "token-heavy integrations" },
  { id: "frontend-stage-canonical", category: "canonical", query: "Place this frontend task in intake, architecture, build, or verify.", owner: "frontend-stage", trigger: "place the work in design intake" },
  { id: "frontend-stage-synonym", category: "synonym", query: "Start or resume a frontend task and apply the exit criteria.", owner: "frontend-stage", trigger: "per-section acceptance" },
  { id: "frontend-architecture-canonical", category: "canonical", query: "Plan a site from a design and freeze a build plan.", owner: "frontend-architecture", trigger: "freeze a build plan" },
  { id: "frontend-architecture-synonym", category: "synonym", query: "Inventory every section and map ACF fields at design intake.", owner: "frontend-architecture", trigger: "acf flexible content" },
  { id: "frontend-enforcement-canonical", category: "canonical", query: "Set up stylelint caps and accessibility gates in CI.", owner: "frontend-enforcement", trigger: "accessibility gates in ci" },
  { id: "frontend-enforcement-synonym", category: "synonym", query: "Make the CSS conventions binary in the pipeline.", owner: "frontend-enforcement", trigger: "css conventions binary" },
  { id: "frontend-library-canonical", category: "canonical", query: "Copy the canonical CUBE CSS library verbatim into a new project.", owner: "frontend-library", trigger: "copy verbatim" },
  { id: "frontend-library-synonym", category: "synonym", query: "Consolidate duplicated components against the canonical library.", owner: "frontend-library", trigger: "consolidating duplicated components" },
  { id: "frontend-process-canonical", category: "canonical", query: "Run the forced frontend build workflow for a new page.", owner: "frontend-process", trigger: "forced frontend build workflow" },
  { id: "frontend-process-synonym", category: "synonym", query: "Follow the phased build from prototype to verification.", owner: "frontend-process", trigger: "with an exit per phase" },
  { id: "frontend-components-canonical", category: "canonical", query: "Implement a new CUBE block as a thin skeleton.", owner: "frontend-components", trigger: "thin skeletons" },
  { id: "frontend-components-synonym", category: "synonym", query: "Restyle a component with custom-property knobs and data-attribute variants.", owner: "frontend-components", trigger: "data-attribute variants" },
  { id: "frontend-tokens-canonical", category: "canonical", query: "Define two-tier design tokens and fluid clamp scales.", owner: "frontend-tokens", trigger: "two-tier design tokens" },
  { id: "frontend-tokens-synonym", category: "synonym", query: "Set up dark mode theming and semantic color aliases.", owner: "frontend-tokens", trigger: "semantic aliases" },
  { id: "single-scoped-edit-stays-local-negative", category: "negative", query: "Commit and push this single scoped edit.", owner: null, trigger: "publish a single edit", near: ["delivery-loop"] },
  { id: "source-summary-is-not-a-decision-negative", category: "negative", query: "Summarize these papers for me.", owner: null, trigger: "summarize these papers", near: ["source-to-decision"] },
  { id: "plain-javascript-is-not-typescript-negative", category: "negative", query: "Refactor this plain JavaScript workflow sequence.", owner: null, trigger: "refactor plain javascript", near: ["typescript-engineering"] },
  { id: "component-layout-is-not-tokens-negative", category: "negative", query: "Lay out the component grid and spacing.", owner: null, trigger: "lay out component grid", near: ["frontend-tokens"] },
  { id: "prose-rewrite-needs-explicit-negative", category: "negative", query: "Rewrite this README prose to sound less robotic.", owner: null, trigger: "less robotic", near: ["unslop"] },
  { id: "production-outage-has-no-owner", category: "no-owner", query: "Fix the production outage right now.", owner: null, trigger: "production outage", near: [] },
];

const ROUTING_COMPANIONS = [];

test("the pinned routing cases resolve against the implicit skill descriptions", () => {
  assert.deepEqual(routingCaseErrors(repositorySkills(), ROUTING_CASES, { companions: ROUTING_COMPANIONS }), []);
});

test("the pinned set covers every category and every implicit skill", () => {
  const skills = repositorySkills();
  const categories = new Set(ROUTING_CASES.map((entry) => entry.category));
  assert.deepEqual([...categories].sort(), ["canonical", "negative", "no-owner", "synonym"]);
  const positive = new Set(
    ROUTING_CASES.filter((entry) => entry.category === "canonical" || entry.category === "synonym").map((entry) => entry.owner),
  );
  for (const skill of skills) {
    if (skill.implicit === false) continue;
    assert.ok(positive.has(skill.name), `${skill.name} has no positive routing case`);
  }
});

test("swapping two descriptions breaks the pinned routing cases", () => {
  const skills = repositorySkills();
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  assert.deepEqual(routingCaseErrors(skills, ROUTING_CASES, { companions: ROUTING_COMPANIONS }), []);
  const swapped = skills.map((skill) => {
    if (skill.name === "delivery-loop") return { ...skill, description: byName.get("slice-work").description };
    if (skill.name === "slice-work") return { ...skill, description: byName.get("delivery-loop").description };
    return skill;
  });
  const errors = routingCaseErrors(swapped, ROUTING_CASES, { companions: ROUTING_COMPANIONS });
  assert.ok(errors.some((error) => error.includes("delivery-loop does not declare trigger")), JSON.stringify(errors.slice(0, 3)));
  assert.ok(errors.some((error) => error.includes("slice-work does not declare trigger")), JSON.stringify(errors.slice(0, 3)));
});

test("dropping a positive case is rejected as incomplete coverage", () => {
  const cases = ROUTING_CASES.filter((entry) => entry.owner !== "delivery-loop");
  const errors = routingCaseErrors(repositorySkills(), cases, { companions: ROUTING_COMPANIONS });
  assert.ok(errors.includes("routing case set: no positive case for delivery-loop"), JSON.stringify(errors));
});

test("an explicit-only skill cannot own an implicit routing case", () => {
  const cases = ROUTING_CASES.map((entry) => (entry.id === "production-outage-has-no-owner" ? { ...entry, owner: "unslop" } : entry));
  const errors = routingCaseErrors(repositorySkills(), cases, { companions: ROUTING_COMPANIONS });
  assert.ok(errors.some((error) => error.includes("owner unslop is explicit-only")), JSON.stringify(errors));
});

test("verbObjectTriggers reads the leading verb-object pair of a description", () => {
  assert.deepEqual(verbObjectTriggers("Audit the export policy for drift before shipping."), ["audit export"]);
  assert.deepEqual(verbObjectTriggers("A reference with no actionable verb."), []);
});

test("trigger-collision reports two descriptions claiming the same trigger", () => {
  const skills = [
    { name: "alpha", implicit: true, description: "Audit the export policy for drift before shipping." },
    { name: "beta", implicit: true, description: "Audit the export policy before every release." },
  ];
  assert.deepEqual(triggerCollisionWarnings(skills), [
    { rule: "trigger-collision", trigger: "audit export", skills: ["alpha", "beta"] },
  ]);
});

test("a declared companion pair suppresses the trigger-collision advisory", () => {
  const skills = [
    { name: "alpha", implicit: true, description: "Audit the export policy for drift before shipping." },
    { name: "beta", implicit: true, description: "Audit the export policy before every release." },
  ];
  assert.deepEqual(triggerCollisionWarnings(skills, { companions: [["beta", "alpha"]] }), []);
});

test("the repository descriptions carry no undeclared trigger collision", () => {
  assert.deepEqual(triggerCollisionWarnings(repositorySkills(), { companions: ROUTING_COMPANIONS }), []);
});
