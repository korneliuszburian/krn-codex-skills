export function capsuleAbiErrors(skillContent, expectedLabels) {
  const capsuleBlock = skillContent.match(/<outcome-capsule>\n([\s\S]*?)<\/outcome-capsule>/);
  if (!capsuleBlock) {
    return ["delivery-loop SKILL.md is missing the outcome-capsule block"];
  }
  const labels = capsuleBlock[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(":")[0].trim());
  if (
    labels.length !== expectedLabels.length ||
    labels.some((label, index) => label !== expectedLabels[index])
  ) {
    return ["delivery-loop capsule ABI labels must match scripts/lib/capsule-abi.mjs ABI_LABELS"];
  }
  return [];
}

export function transitionHandlersFrom(content) {
  return content
    .split("\n")
    .filter((line) => /^\|\s*[^|]+\|\s*`[^`]+`\s*\|/.test(line))
    .map((line) => line.split("|")[2].trim().replace(/^`|`$/g, ""));
}

export function transitionErrors(content, { knownHandlers, baseline }) {
  const errors = [];
  const handlers = transitionHandlersFrom(content);
  for (const handler of handlers) {
    if (!knownHandlers.has(handler)) errors.push(`transitions: unknown handler ${handler}`);
  }
  const duplicates = handlers.filter((handler, index) => handlers.indexOf(handler) !== index);
  if (duplicates.length > 0) errors.push(`transitions: duplicate handler ${duplicates[0]}`);
  for (const handler of handlers) {
    if (!baseline.has(handler)) errors.push(`transitions: handler ${handler} is not in the harness baseline`);
  }
  for (const name of baseline) {
    if (!handlers.includes(name)) errors.push(`transitions: baseline skill ${name} is not named by any transition`);
  }
  return errors;
}
