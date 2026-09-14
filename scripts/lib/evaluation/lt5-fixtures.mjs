const HASH = /^[0-9a-f]{8,}$/;

export function lt5FixtureManifestErrors(manifest) {
  if (!manifest || typeof manifest !== "object") return ["manifest must be an object"];
  const errors = [];
  if (!Array.isArray(manifest.tasks)) return ["manifest.tasks must be an array"];
  if (manifest.tasks.length === 0) return ["manifest.tasks must not be empty"];
  const duplicateId = manifest.tasks.map((task) => task?.id).find((id, index, all) => typeof id === "string" && all.indexOf(id) !== index);
  if (duplicateId) return [`manifest.tasks has a duplicate id: ${duplicateId}`];
  const byId = new Map(manifest.tasks.map((task) => [task?.id, task]));
  const mechanisms = new Map();
  for (const task of manifest.tasks) {
    const id = task?.id;
    if (typeof id !== "string" || id === "") {
      errors.push("a task is missing its id");
      continue;
    }
    if (typeof task.mechanism !== "string" || task.mechanism === "") errors.push(`${id}: missing dependency mechanism`);
    if (task.stratum !== "decisive" && task.stratum !== "neutral") errors.push(`${id}: stratum must be decisive or neutral`);
    if (!HASH.test(task.fixture_hash ?? "")) errors.push(`${id}: missing retained fixture hash`);
    if (!HASH.test(task.answer_hash ?? "")) errors.push(`${id}: missing retained answer-key hash`);
    if (task.answer_key_inside_bind === true) errors.push(`${id}: answer key sits inside an agent-readable bind`);
    if (task.stratum === "decisive") {
      if (task.gold_passes !== true) errors.push(`${id}: gold solution must pass`);
      if (task.change_only_fails_on_dependency !== true) errors.push(`${id}: requested change must fail solely on the omitted dependency`);
      const partner = byId.get(task.neutral_partner);
      if (!partner || partner.stratum !== "neutral" || partner.id === id) errors.push(`${id}: decisive task needs a matched neutral partner`);
      const seen = mechanisms.get(task.mechanism) ?? [];
      if (task.mechanism && seen.length > 0) errors.push(`${id}: mechanism ${task.mechanism} is already used by ${seen.join(", ")}`);
      if (task.mechanism) mechanisms.set(task.mechanism, [...seen, id]);
    }
    if (task.stratum === "neutral" && task.zero_trigger_hits !== true) errors.push(`${id}: neutral task must return zero trigger hits`);
  }
  if (!manifest.placebo || manifest.placebo.already_satisfied !== true) {
    errors.push("manifest.placebo must be already satisfied with no lesson applied");
  }
  return errors;
}
