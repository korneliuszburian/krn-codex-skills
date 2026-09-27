import fs from "node:fs";

import { gitTopLevel, runGit } from "../kernel/git.mjs";
import { runProcess } from "../kernel/proc.mjs";
import { tapSummary } from "../kernel/tap.mjs";
import { withWorktree } from "../kernel/worktree.mjs";

// One owner for the gated-transition primitive. A state change is admissible
// only when it carries an executed falsifier whose base state was observed red,
// checked by a verifier independent of the author. Waivers are refused until
// a caller can name the waived obligation and independently resolve its anchor.
// The four decision surfaces (commit, task close, review, handoff) are callers;
// the verifier is the seam.
//
// The CLI-facing check owns Git identity and command evidence in this module;
// the generic admission function still trusts its injected verifier and caller.

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

export function gateTransition({ transition, claim, verifier } = {}) {
  const transitionError = validTransition(transition);
  if (transitionError) return refuse(transitionError);
  const claimError = validClaim(claim);
  if (claimError) return refuse(claimError);
  if (claim.waiver !== undefined) return refuse("waiver flags are unsupported without a named obligation and an independently resolved anchor");
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
      return result?.setup === true
        ? { ok: false, reason: `falsifier setup error at the head (exit ${result.status ?? "unknown"})` }
        : result?.ok === true
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

// One CLI seam owns the whole observation. No other caller inherits Git or
// executed-RED guarantees merely by invoking gateTransition directly.
export function checkGateCommand({ root, kind, fixedPoint: requested, base: requestedBase, falsifier, waiverReason, waiverResolves, env }) {
  if (kind !== "commit") return refuse("gate check supports only commit transitions; other engines own their own proof");
  const resolveCommit = (ref) => {
    const found = runGit(root, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
    return found.ok && /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(found.out) ? found.out : null;
  };
  const head = resolveCommit("HEAD");
  const fixedPoint = resolveCommit(requested);
  const base = requestedBase ? resolveCommit(requestedBase) : null;
  const top = gitTopLevel(root);
  const clean = runGit(root, ["status", "--porcelain", "--untracked-files=all"]);
  const refusal = !top || fs.realpathSync(top) !== fs.realpathSync(root)
    ? "gate root must be a Git repository top level"
    : !head || !fixedPoint || fixedPoint !== head
      ? "fixed point must resolve to the current HEAD commit"
      : requestedBase && !base
        ? "base ref must resolve to a commit"
        : !clean.ok || clean.out
          ? "the evaluated working tree must be clean"
          : null;
  if (refusal) return refuse(refusal);

  const falsifierRun = (cwd, command) => {
    const result = runProcess("bash", ["-lc", command], { cwd, timeout: 600000, env });
    const nodeTest = /\bnode\b[^;&|]*--test(?:\s|=|$)/.test(command);
    const output = `${result.out}${result.err}`;
    const tap = tapSummary(output);
    const hasTap = /^TAP version \d+$/m.test(output);
    const hasSpec = /^ℹ tests \d+$/m.test(output);
    // A file-level load failure has exitCode, even for an extensionless file;
    // a real test may be NAMED "SyntaxError" or "config.js".
    const tapRed = tap.tests > 0 && tap.fail > 0 && /failureType: 'testCodeFailure'/.test(output)
      && !/^\s*exitCode: /m.test(output);
    const specNames = [...output.matchAll(/^✖ (.+?) \([0-9.]+ms\)$/gm)].map((entry) => entry[1]);
    // A spec reporter may print ANY file-load error before its first ✖.
    // Accept only known pass lines ahead of a named failure, not arbitrary
    // output masquerading as a test case or a title resembling a filename.
    const firstSpecFailure = output.search(/^✖ /m);
    const specPrefix = output.slice(0, firstSpecFailure).split("\n").filter(Boolean);
    const specRed = firstSpecFailure >= 0 && /^ℹ fail [1-9]\d*$/m.test(output) && specNames.length > 0
      && specPrefix.every((line) => /^✔ .+ \([0-9.]+ms\)$/.test(line));
    const setup = result.status === null || result.signal !== null || result.errorCode !== null
      || result.status === 126 || result.status === 127
      || (!result.ok && ((hasTap && !tapRed) || (hasSpec && !specRed) || (nodeTest && !hasTap && !hasSpec)));
    return { ok: result.ok, status: result.status, setup, red: !result.ok && !setup };
  };

  // Base uses an immutable commit; the clean working HEAD is checked before
  // and after execution, not an atomic snapshot of transient writes.
  const baseOutcome = base ? withWorktree({ root, ref: base, git: runGit }, (dir) => falsifierRun(dir, falsifier)) : null;
  const before = { red: baseOutcome?.red === true, evidence: baseOutcome ? `exit ${baseOutcome.status ?? "unknown"} at ${base}` : "no base was observed" };
  const claim = { falsifier, before };
  if (waiverReason !== undefined || waiverResolves !== undefined) claim.waiver = { reason: waiverReason, resolves: waiverResolves };
  const verifier = commandVerifier({ run: (command, { cwd }) => falsifierRun(cwd, command), cwd: root });
  let verdict = base && !baseOutcome
    ? refuse("base checkout setup error")
    : baseOutcome?.setup
      ? refuse(`base falsifier setup error (exit ${baseOutcome.status ?? "unknown"})`)
      : gateTransition({ transition: { kind, fixedPoint }, claim, verifier });
  if (verdict.admitted) {
    const stillClean = runGit(root, ["status", "--porcelain", "--untracked-files=all"]);
    if (resolveCommit("HEAD") !== head || !stillClean.ok || stillClean.out) verdict = refuse("fixed point changed while checking");
  }
  return { ...verdict, fixedPoint, base, before };
}
