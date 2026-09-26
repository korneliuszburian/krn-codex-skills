// One owner for the gated-transition primitive. A state change is admissible
// only when it carries an executed falsifier whose base state was observed red,
// checked by a verifier independent of the author, with an explicit resolvable
// waiver for anything unpayable. The four decision surfaces (commit, task
// close, review, handoff) are callers; the verifier is the seam.
//
// The interface is deliberately small: one admission function, one brief
// projection, and the verifier adapters. Everything a caller must know is the
// three shapes below; the governance lives behind them.

export const TRANSITION_KINDS = Object.freeze(["commit", "task-close", "review", "handoff"]);

const refuse = (reason, extra = {}) => ({ admitted: false, reason, ...extra });

function validTransition(transition) {
  if (!transition || typeof transition !== "object") return "transition is required";
  if (!TRANSITION_KINDS.includes(transition.kind)) return `transition.kind must be one of ${TRANSITION_KINDS.join(", ")}`;
  if (typeof transition.fixedPoint !== "string" || !transition.fixedPoint.trim()) return "transition.fixedPoint must be a non-empty commit or artifact identity";
  return null;
}

function validClaim(claim) {
  if (!claim || typeof claim !== "object") return "claim is required";
  if (typeof claim.falsifier !== "string" || !claim.falsifier.trim()) return "claim.falsifier must be one concrete command that exits nonzero";
  if (!claim.before || claim.before.red !== true) return `claim.before must be the observed red base state, got "${claim.before?.red === false ? "green" : "none"}"`;
  return null;
}

// A waiver is admissible only when it is reasoned and resolves to something the
// repository already holds; a bare "none" is never a discharge.
function waiverVerdict(waiver) {
  if (!waiver || typeof waiver !== "object") return refuse("a waiver must be an object with a reason and a resolution");
  if (typeof waiver.reason !== "string" || !waiver.reason.trim()) return refuse("a waiver requires a reason");
  if (!Array.isArray(waiver.resolves) || waiver.resolves.length === 0 || waiver.resolves.some((entry) => typeof entry !== "string" || !entry.trim())) {
    return refuse("a waiver must resolve to at least one repository anchor");
  }
  return { admitted: true, reason: "", waiver: true, evidence: `waived: ${waiver.reason.trim()}` };
}

export function gateTransition({ transition, claim, verifier } = {}) {
  const transitionError = validTransition(transition);
  if (transitionError) return refuse(transitionError);
  const claimError = validClaim(claim);
  if (claimError) return refuse(claimError);
  if (claim.waiver !== undefined) return waiverVerdict(claim.waiver);
  if (!verifier || typeof verifier.verify !== "function") return refuse("an injected verifier is required");
  let outcome;
  try {
    outcome = verifier.verify({ transition, claim });
  } catch (error) {
    return refuse(`the verifier failed: ${error.message}`);
  }
  if (!outcome || outcome.ok !== true) {
    return refuse(outcome?.reason || "the verifier did not admit the transition", { evidence: outcome?.evidence ?? "" });
  }
  return { admitted: true, reason: "", evidence: outcome.evidence ?? "", verifier: verifier.name ?? "unnamed" };
}

// The subagent's whole contract is the brief, not the claim: fixed point, scope,
// one falsifier command, and the output contract. The claim belongs to the
// integrator that owns the artifact.
export function briefFor({ claim, fixedPoint, scope, output }) {
  if (!claim || typeof claim.falsifier !== "string" || !claim.falsifier.trim()) throw new Error("briefFor requires a claim with a concrete falsifier");
  for (const [name, value] of [["fixedPoint", fixedPoint], ["scope", scope], ["output", output]]) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`briefFor requires ${name}`);
  }
  return [
    `Fixed point: ${fixedPoint}`,
    `Scope: ${scope}`,
    `Falsifier: ${claim.falsifier}`,
    `Output: ${output}`,
  ].join("\n");
}

// Adapter one: a deterministic command verifier. The falsifier must pass at the
// head; the base red is the claim's observed before-state.
export function commandVerifier({ run, cwd } = {}) {
  if (typeof run !== "function") throw new Error("commandVerifier requires a run function");
  return {
    name: "command",
    verify({ claim }) {
      const result = run(claim.falsifier, { cwd });
      return result?.ok === true
        ? { ok: true, evidence: `executed: ${claim.falsifier}` }
        : { ok: false, reason: `the falsifier did not pass at the head (exit ${result?.status ?? "unknown"})` };
    },
  };
}

// Adapter two: an independent-family review verifier. Two adapters make the
// verifier a real seam rather than a hypothetical one.
export function familyVerifier({ review, family } = {}) {
  if (typeof review !== "function") throw new Error("familyVerifier requires a review function");
  if (typeof family !== "string" || !family.trim()) throw new Error("familyVerifier requires a family name");
  return {
    name: `family:${family}`,
    verify({ transition, claim }) {
      const outcome = review({ transition, claim });
      return outcome?.ok === true
        ? { ok: true, evidence: `reviewed by ${family}` }
        : { ok: false, reason: outcome?.reason || `the ${family} review did not admit the transition` };
    },
  };
}

// Failure-gated escalation: a new mechanism is admissible only against a
// recorded failure of the current one. This is the inverse of a
// batteries-included reflex.
export function escalationGate({ current, proposed, failure } = {}) {
  if (typeof current !== "string" || !current.trim()) return refuse("escalationGate requires the current mechanism");
  if (typeof proposed !== "string" || !proposed.trim()) return refuse("escalationGate requires the proposed mechanism");
  if (!failure || failure.recorded !== true || typeof failure.evidence !== "string" || !failure.evidence.trim()) {
    return refuse("escalation requires a recorded failure of the current mechanism");
  }
  return { admitted: true, reason: "", evidence: `escalate ${current} -> ${proposed}: ${failure.evidence}` };
}
