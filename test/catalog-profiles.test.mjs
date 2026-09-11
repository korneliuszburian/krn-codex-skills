import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getCapabilityProfile,
  HARD_QUARANTINE_FAMILIES,
  isHardQuarantined,
  validateProfilesDocument,
} from "../scripts/lib/catalog-profiles.mjs";
import { loadCapabilityProfiles } from "../scripts/lib/catalog-inventory.mjs";

const load = () =>
  JSON.parse(readFileSync(new URL("../config/capability-profiles.json", import.meta.url), "utf8"));
const clone = () => structuredClone(load());

test("loadCapabilityProfiles reads the installed profile document", async () => {
  const document = await loadCapabilityProfiles();
  assert.equal(document.schemaVersion, 1);
  assert.equal(typeof document.profiles.minimal.description, "string");
});

test("getCapabilityProfile returns a detached clone", () => {
  const document = clone();
  const profile = getCapabilityProfile(document, "minimal");
  profile.skills.preserveScopes.length = 0;
  assert.ok(document.profiles.minimal.skills.preserveScopes.includes("project-local"));
  assert.throws(() => getCapabilityProfile(document, "unknown"), /Unknown capability profile 'unknown'/);
});

test("validateProfilesDocument rejects policy violations", () => {
  const missingScope = clone();
  missingScope.profiles.minimal.skills.preserveScopes = ["global-index"];
  assert.throws(() => validateProfilesDocument(missingScope), /must preserve project-local skills/);

  const conflict = clone();
  conflict.profiles.minimal.plugins.enable = ["demo@market"];
  conflict.profiles.minimal.plugins.disable = ["demo@market"];
  assert.throws(() => validateProfilesDocument(conflict), /both enables and disables/);

  const quarantined = clone();
  quarantined.profiles.minimal.skills.enable = ["superpowers"];
  assert.throws(() => validateProfilesDocument(quarantined), /cannot enable hard-quarantined capability/);

  const families = clone();
  families.hardQuarantine.families = ["other"];
  assert.throws(() => validateProfilesDocument(families), /fixed hard-quarantine families/);
});

test("isHardQuarantined matches the fixed family list", () => {
  assert.deepEqual([...HARD_QUARANTINE_FAMILIES], ["superpowers"]);
  assert.equal(isHardQuarantined("superpowers@market"), true);
  assert.equal(isHardQuarantined("demo@market"), false);
});
