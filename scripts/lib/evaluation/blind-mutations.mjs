export function scoreVerdicts({ mutants = [], controls = [], findings = {} } = {}) {
  const reported = findings && typeof findings === "object" ? findings : {};
  let truePositives = 0;
  let falseNegatives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  for (const id of mutants) {
    if (Object.hasOwn(reported, id) && reported[id]) truePositives += 1;
    else falseNegatives += 1;
  }
  for (const id of controls) {
    if (Object.hasOwn(reported, id) && reported[id]) falsePositives += 1;
    else trueNegatives += 1;
  }
  const sensitivity = mutants.length === 0 ? null : truePositives / mutants.length;
  const specificity = controls.length === 0 ? null : trueNegatives / controls.length;
  return { truePositives, falseNegatives, falsePositives, trueNegatives, sensitivity, specificity };
}

export function summarizeSensitivity(result, { minSensitivity = 0.8 } = {}) {
  const findings = [];
  if (!Number.isFinite(result?.sensitivity)) findings.push("no finite sensitivity: judge sensitivity is unmeasured");
  else if (result.sensitivity < minSensitivity) findings.push(`judge sensitivity ${result.sensitivity.toFixed(2)} is below ${minSensitivity}`);
  if (Number.isFinite(result?.falsePositives) && result.falsePositives > 0) {
    findings.push(`${result.falsePositives} clean control(s) were reported as faults`);
  }
  return { ok: findings.length === 0, findings };
}
