const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const Z_ONE_SIDED_05 = 1.6449;

export const clustersFor = ({ tasksPerStratum = 0 } = {}) => tasksPerStratum * 2;

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const variance = (values) => {
  const m = mean(values);
  return values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
};

// Repeated measures shrink the within-task noise but add no independent task, so
// the effective sample size is the task count; reps never enter the cluster count.
export function simulatePower({ tasksPerStratum = 8, reps = 3, q = 0.3, theta = 0, zOneSided = Z_ONE_SIDED_05, sims = 2000, seed = 1 } = {}) {
  if (!Number.isInteger(tasksPerStratum) || tasksPerStratum < 2) throw new RangeError("tasksPerStratum must be an integer >= 2");
  if (!Number.isInteger(reps) || reps < 1) throw new RangeError("reps must be an integer >= 1");
  if (!Number.isInteger(sims) || sims < 1) throw new RangeError("sims must be an integer >= 1");
  if (!(q >= 0 && q <= 1)) throw new RangeError("q must be in [0, 1]");
  const random = mulberry32(seed);
  const draw = (offset) => {
    const up = Math.max(0, (q + offset) / 2);
    const down = Math.max(0, (q - offset) / 2);
    const roll = random();
    if (roll < up) return 1;
    if (roll < up + down) return -1;
    return 0;
  };
  const sample = (offset) => {
    const taskMeans = [];
    for (let task = 0; task < tasksPerStratum; task += 1) {
      let sum = 0;
      for (let rep = 0; rep < reps; rep += 1) sum += draw(offset);
      taskMeans.push(sum / reps);
    }
    return taskMeans;
  };

  // A sample-estimated standard error follows t, not the normal, at small df.
  const degreesOfFreedom = clustersFor({ tasksPerStratum }) - 2;
  const criticalValue = zOneSided + (zOneSided ** 3 + zOneSided) / (4 * degreesOfFreedom);

  let rejections = 0;
  for (let simulation = 0; simulation < sims; simulation += 1) {
    const decisive = sample(theta);
    const neutral = sample(0);
    const standardError = Math.sqrt(variance(decisive) / decisive.length + variance(neutral) / neutral.length);
    const difference = mean(decisive) - mean(neutral);
    const statistic = !Number.isFinite(standardError)
      ? Number.NaN
      : standardError === 0
        ? (difference > 0 ? Number.POSITIVE_INFINITY : 0)
        : difference / standardError;
    if (statistic > criticalValue) rejections += 1;
  }

  const rate = rejections / sims;
  return {
    clusters: clustersFor({ tasksPerStratum }),
    tasksPerStratum,
    reps,
    sims,
    criticalValue,
    power: rate,
    nullRejection: theta === 0 ? rate : null,
  };
}
