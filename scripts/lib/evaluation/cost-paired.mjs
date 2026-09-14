export function costPaired(records = []) {
  const unmeasured = [];
  const measured = [];
  for (const record of Array.isArray(records) ? records : []) {
    const hasTokens = Number.isFinite(record?.tokens_in) && Number.isFinite(record?.tokens_out);
    if (!record || typeof record.task !== "string" || typeof record.arm !== "string" || !hasTokens) {
      unmeasured.push({ task: record?.task ?? null, arm: record?.arm ?? null, reason: "missing captured tokens" });
      continue;
    }
    measured.push(record);
  }

  const arms = new Map();
  for (const record of measured) {
    const entry = arms.get(record.arm) ?? { arm: record.arm, tasks: new Set(), tokens: 0, successes: 0 };
    entry.tasks.add(record.task);
    entry.tokens += record.tokens_in + record.tokens_out;
    if (record.held_out_pass === true) entry.successes += 1;
    arms.set(record.arm, entry);
  }
  const perArm = [...arms.values()].map((entry) => ({
    arm: entry.arm,
    tasks: entry.tasks.size,
    tokens: entry.tokens,
    successes: entry.successes,
    cost_per_success: entry.successes > 0 ? entry.tokens / entry.successes : null,
  }));
  perArm.sort((left, right) => left.arm.localeCompare(right.arm));

  const byTask = new Map();
  for (const record of measured) {
    const entry = byTask.get(record.task) ?? new Map();
    entry.set(record.arm, record);
    byTask.set(record.task, entry);
  }
  const armNames = [...arms.keys()].sort();
  const paired = [];
  for (const [task, byArm] of byTask) {
    for (let left = 0; left < armNames.length; left += 1) {
      for (let right = left + 1; right < armNames.length; right += 1) {
        const from = byArm.get(armNames[left]);
        const to = byArm.get(armNames[right]);
        if (!from || !to) continue;
        paired.push({
          task,
          from: from.arm,
          to: to.arm,
          token_delta: to.tokens_in + to.tokens_out - (from.tokens_in + from.tokens_out),
          pass_delta: (to.held_out_pass === true ? 1 : 0) - (from.held_out_pass === true ? 1 : 0),
        });
      }
    }
  }
  paired.sort((left, right) => left.task.localeCompare(right.task) || left.from.localeCompare(right.from));

  return { per_arm: perArm, paired, unmeasured };
}
