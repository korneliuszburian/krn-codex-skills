const HASH = /^[0-9a-f]{8,}$/;

export function fixtureManifestErrors(manifest) {
  if (!manifest || typeof manifest !== "object") return ["manifest must be an object"];
  const errors = [];
  if (!Array.isArray(manifest.tasks)) return ["manifest.tasks must be an array"];
  const ids = new Set(manifest.tasks.map((task) => task?.id));
  for (const task of manifest.tasks) {
    const id = task?.id;
    if (typeof id !== "string" || id === "") {
      errors.push("a task is missing its id");
      continue;
    }
    if (!HASH.test(task.fixture_hash ?? "")) errors.push(`${id}: missing retained fixture hash`);
    if (!HASH.test(task.answer_hash ?? "")) errors.push(`${id}: missing retained answer-key hash`);
    if (task.answer_key_inside_bind === true) errors.push(`${id}: answer key sits inside an agent-readable bind`);
    if (task.stratum !== "decisive" && task.stratum !== "neutral") errors.push(`${id}: stratum must be decisive or neutral`);
    if (task.stratum === "decisive") {
      if (!Number.isInteger(task.reps) || task.reps < 3) errors.push(`${id}: decisive task needs at least 3 planned reps`);
      if (typeof task.neutral_partner !== "string" || !ids.has(task.neutral_partner)) {
        errors.push(`${id}: decisive task needs a matched neutral partner`);
      }
    }
  }
  if (!manifest.placebo || manifest.placebo.length_matched !== true) {
    errors.push("manifest.placebo must be length-matched to arm B");
  }
  if (!manifest.placebo || manifest.placebo.already_satisfied !== true) {
    errors.push("manifest.placebo must be already satisfied with no lesson applied");
  }
  return errors;
}
