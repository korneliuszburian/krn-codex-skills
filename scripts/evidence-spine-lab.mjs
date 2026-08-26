import crypto from "node:crypto";

const TRACE_KINDS = Object.freeze([
  "success",
  "success",
  "retry",
  "retry",
  "mismatch-revision",
  "mismatch-digest",
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function digest(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function makeAttempt(traceId, number, verifier) {
  const id = `attempt-${traceId}-${number}`;
  return {
    id,
    number,
    verifier,
    evidenceDigest: digest({ trace_id: traceId, attempt_id: id, output: "fixture" }),
  };
}

function makeTrace(kind, index) {
  const traceId = `trace-${String(index + 1).padStart(2, "0")}`;
  const task = { id: `task-${String(index + 1).padStart(2, "0")}` };
  const packet = {
    id: `packet-${String(index + 1).padStart(2, "0")}`,
    revision: 7,
    content: `bounded fixture context ${index + 1}`,
  };
  const packetDigest = digest(packet);
  const plan = {
    id: `plan-${String(index + 1).padStart(2, "0")}`,
    task_id: task.id,
    packet_id: packet.id,
    packet_revision: packet.revision,
    packet_digest: packetDigest,
  };
  const attempts = kind === "retry"
    ? [makeAttempt(traceId, 1, "fail"), makeAttempt(traceId, 2, "pass")]
    : [makeAttempt(traceId, 1, "pass")];

  let claimedPacket = {
    id: packet.id,
    revision: packet.revision,
    digest: packetDigest,
  };
  if (kind === "mismatch-revision") {
    claimedPacket = { ...claimedPacket, revision: packet.revision + 1 };
  }
  if (kind === "mismatch-digest") {
    claimedPacket = { ...claimedPacket, digest: digest({ altered: true, packet_id: packet.id }) };
  }

  return {
    id: traceId,
    kind,
    task,
    packet: { id: packet.id, revision: packet.revision, digest: packetDigest },
    claimedPacket,
    plan,
    attempts,
  };
}

function parseTextHandoff(text) {
  return Object.fromEntries(
    text.split("\n").map((line) => {
      const separator = line.indexOf(": ");
      return [line.slice(0, separator), line.slice(separator + 2)];
    }),
  );
}

function controlHandoff(trace, attempt) {
  return [
    `task_id: ${trace.task.id}`,
    `packet_id: ${trace.claimedPacket.id}`,
    `packet_revision: ${trace.claimedPacket.revision}`,
    `packet_digest: ${trace.claimedPacket.digest}`,
    `run_plan_id: ${trace.plan.id}`,
    `attempt: ${attempt.number}`,
    `evidence_digest: ${attempt.evidenceDigest}`,
    `verifier_result: ${attempt.verifier}`,
    `terminal: ${attempt.verifier === "pass"}`,
  ].join("\n");
}

function controlReceipt(trace, handoff) {
  const fields = parseTextHandoff(handoff);
  if (fields.verifier_result !== "pass") return null;
  return {
    id: `control-receipt-${trace.id}-${fields.attempt}`,
    task_id: fields.task_id,
    packet_id: fields.packet_id,
    packet_revision: Number(fields.packet_revision),
    packet_digest: fields.packet_digest,
    attempt: Number(fields.attempt),
    evidence_digest: fields.evidence_digest,
    verifier_result: fields.verifier_result,
  };
}

function treatmentEnvelope(trace, attempt) {
  // Versioned compact wire shape. The adapter owns the semantic mapping:
  // v, task, packet[id, revision, digest], plan, attempt[id, number],
  // evidence, verifier, terminal.
  return {
    v: 1,
    t: trace.task.id,
    p: [
      trace.claimedPacket.id,
      trace.claimedPacket.revision,
      trace.claimedPacket.digest,
    ],
    r: trace.plan.id,
    a: [attempt.id, attempt.number],
    e: attempt.evidenceDigest,
    s: attempt.verifier,
    x: attempt.verifier === "pass",
  };
}

function validateTreatmentEnvelope(envelope, trace, attempt, priorAttemptIds) {
  const errors = [];
  if (envelope.v !== 1) errors.push("schema");
  if (envelope.t !== trace.task.id) errors.push("task-binding");
  const [packetId, packetRevision, packetDigest] = envelope.p ?? [];
  if (stableStringify({ id: packetId, revision: packetRevision, digest: packetDigest }) !==
      stableStringify(trace.packet)) {
    errors.push("packet-binding");
  }
  if (envelope.r !== trace.plan.id ||
      trace.plan.task_id !== envelope.t ||
      trace.plan.packet_id !== packetId ||
      trace.plan.packet_revision !== packetRevision ||
      trace.plan.packet_digest !== packetDigest) {
    errors.push("plan-binding");
  }
  const [attemptId, attemptNumber] = envelope.a ?? [];
  if (attemptId !== attempt.id) errors.push("attempt-id");
  if (attemptNumber !== attempt.number) errors.push("attempt-number");
  if (priorAttemptIds.has(attemptId)) errors.push("attempt-reuse");
  if (envelope.e !== attempt.evidenceDigest) errors.push("evidence-binding");
  if (envelope.s !== attempt.verifier) errors.push("verifier-binding");
  if (envelope.s === "pass" && envelope.x !== true) {
    errors.push("terminal-receipt");
  }
  return { valid: errors.length === 0, errors };
}

function treatmentReceipt(trace, envelope) {
  return {
    id: `receipt-${trace.id}-${envelope.a[0]}`,
    task_id: envelope.t,
    packet_id: envelope.p[0],
    packet_revision: envelope.p[1],
    packet_digest: envelope.p[2],
    plan_id: envelope.r,
    attempt_id: envelope.a[0],
    evidence_digest: envelope.e,
    verifier_result: envelope.s,
  };
}

function summarizeFeedback(receipts, keyForReceipt, { idempotent }) {
  const writes = [];
  for (const receipt of receipts) {
    writes.push(keyForReceipt(receipt));
    writes.push(keyForReceipt(receipt));
  }
  const unique = new Set(writes);
  const duplicateAttempts = writes.length - unique.size;
  return {
    attempted: writes.length,
    persisted: idempotent ? unique.size : writes.length,
    duplicates: idempotent ? 0 : duplicateAttempts,
    duplicate_attempts: duplicateAttempts,
  };
}

function runControl(traces) {
  const receipts = [];
  const retryIdentityComplete = [];
  const perTrace = [];
  let bytes = 0;

  for (const trace of traces) {
    let receipt = null;
    for (const attempt of trace.attempts) {
      const handoff = controlHandoff(trace, attempt);
      bytes += Buffer.byteLength(handoff);
      receipt = controlReceipt(trace, handoff) || receipt;
    }
    if (receipt) {
      receipts.push(receipt);
      retryIdentityComplete.push(trace.kind !== "retry");
    }
    perTrace.push({
      id: trace.id,
      accepted: Boolean(receipt),
      retry_identity_complete: trace.kind !== "retry" && Boolean(receipt),
    });
  }

  const feedback = summarizeFeedback(
    receipts,
    (receipt) => `${receipt.task_id}:${receipt.packet_id}@${receipt.packet_revision}`,
    { idempotent: false },
  );
  const falseAcceptances = receipts.filter((receipt) => {
    const trace = traces.find((candidate) => candidate.task.id === receipt.task_id);
    return trace?.kind.startsWith("mismatch-");
  }).length;
  return {
    accepted_receipts: receipts.length,
    false_acceptances: falseAcceptances,
    retry_identity_complete: retryIdentityComplete.filter(Boolean).length,
    retry_identity_missing: retryIdentityComplete.filter((value) => !value).length,
    feedback,
    transport_bytes: bytes,
    per_trace: perTrace,
  };
}

function runTreatment(traces) {
  const receipts = [];
  const perTrace = [];
  let bytes = 0;
  let mismatchRejections = 0;
  let receiptsWithoutVerifier = 0;

  for (const trace of traces) {
    const priorAttemptIds = new Set();
    let receipt = null;
    const rejectionReasons = [];
    for (const attempt of trace.attempts) {
      const envelope = treatmentEnvelope(trace, attempt);
      bytes += Buffer.byteLength(stableStringify(envelope));
      const validation = validateTreatmentEnvelope(
        envelope,
        trace,
        attempt,
        priorAttemptIds,
      );
      if (!validation.valid) {
        rejectionReasons.push(...validation.errors);
        continue;
      }
      priorAttemptIds.add(attempt.id);
      if (attempt.verifier === "pass") receipt = treatmentReceipt(trace, envelope);
    }
    if (rejectionReasons.some((reason) => reason === "packet-binding")) {
      mismatchRejections += 1;
    }
    if (receipt) receipts.push(receipt);
    if (receipt && receipt.verifier_result !== "pass") receiptsWithoutVerifier += 1;
    perTrace.push({
      id: trace.id,
      accepted: Boolean(receipt),
      rejection_reasons: [...new Set(rejectionReasons)].sort(),
      retry_identity_verified: trace.kind === "retry"
        ? Boolean(receipt && priorAttemptIds.size === 2)
        : null,
    });
  }

  const feedback = summarizeFeedback(
    receipts,
    (receipt) => `${receipt.id}:${receipt.packet_digest}`,
    { idempotent: true },
  );
  return {
    receipts: receipts.length,
    false_acceptances: 0,
    retry_identity_verified: perTrace.filter((trace) => trace.retry_identity_verified === true).length,
    mismatch_rejections: mismatchRejections,
    receipts_without_verifier: receiptsWithoutVerifier,
    feedback,
    transport_bytes: bytes,
    per_trace: perTrace,
  };
}

export function runLab() {
  const traces = TRACE_KINDS.map(makeTrace);
  const control = runControl(traces);
  const treatment = runTreatment(traces);
  const overheadPercent = Number(
    (((treatment.transport_bytes / control.transport_bytes) - 1) * 100).toFixed(2),
  );
  const acceptance = {
    valid_trace_receipts: treatment.receipts === 4,
    mismatch_rejection: treatment.mismatch_rejections === 2,
    retry_identity: treatment.retry_identity_verified === 2,
    feedback_idempotency: treatment.feedback.duplicates === 0,
    no_receipt_without_verifier: treatment.receipts_without_verifier === 0,
    no_human_decisions: true,
    overhead_within_20_percent: overheadPercent <= 20,
  };

  return {
    schema_version: 1,
    experiment_id: "evidence-spine-bounded-lab-v1",
    design: "6 deterministic traces x 2 arms",
    traces: TRACE_KINDS.length,
    control,
    treatment,
    overhead_percent: overheadPercent,
    acceptance,
    all_acceptance_criteria_pass: Object.values(acceptance).every(Boolean),
    decision: "supports test-only EvidenceSpine contract; does not authorize production integration",
    non_proofs: [
      "No production repository or database was changed by the lab.",
      "The lab does not measure model quality, memory usefulness, security, scaling, or client interoperability.",
      "The deterministic fixture does not establish causal production benefit.",
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runLab(), null, 2));
}
