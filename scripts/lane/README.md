# scripts/lane

The AFK lane family, admitted into the repository from the LT-7 lab by `sh-62`.
It lets a host run one ticket in an isolated worker session, gate the worker's
commit, and hand the branch to an integrator. It carries no checkout or mount
prefix: every machine fact arrives as an environment variable with a relative or
`command -v` default, and this page records the intended host wiring.

## Tools

- `run-ticket.sh` — one ticket, one fresh worker session, one isolated clone.
  Modes: `probe` (default), `run`, `classify <check>`, `probe-verdict`, and
  `bwrap-args` (print the sandbox composition without running bwrap).
- `run-frontier.sh` — loop `next -> claim -> lane -> integrate -> close` until
  the frontier is empty or `MAX_RUNS` is reached. With an active Git-ref task
  queue, it claims by ID and closes only through operation readback.
- `integrate.sh` — merge one worker branch into the fixture worktree and gate
  the merged fixed point.
- `publish.sh` — refuse publication without explicit authority; dry by default.
- `capsule-writeback.py` — rewrite the mechanical fields of one outcome capsule.

## Host wiring

The defaults are relative to the current directory, so a developer can run the
structural modes anywhere. A real lane needs a fixture with a working tree and a
sandboxed worker:

- `BASE` — the lane root; defaults to the current directory.
- `FIXTURE` — the git repository the worker branches from; defaults to `BASE`.
- `BASE_REF` — the cut ref; defaults to `main`.
- `KRN` — the `krn` CLI; defaults to `krn` on `PATH`, then
  `$FIXTURE/scripts/krn.mjs`.
- `BWRAP` — the bubblewrap binary; defaults to `bwrap` on `PATH`. Version
  `0.12.0` or newer is required and a setuid build is refused.
- `WORKER` — `codex`, `opencode`, or the `stub` test double; defaults to
  `codex`. `MODEL`/`ALLOWED_MODELS` pin the authorized model.
- `CODEX_PKG_HOST`/`CODEX_JS` — the pinned Codex package root and entrypoint.
- `OPENCODE_HOME`/`OPENCODE_AUTH` — the OpenCode install and its auth file.
- `MISE_ROOT` — optional toolchain root mounted read-only at `/mise`.
- `STUB_SCRIPT` — the double's script when `WORKER=stub`.
- `PUBLISH_GATE` — the command that verifies a green PR at the lane branch's
  fixed point (for example a CI check and a tagged PR readiness check). It is
  invoked as `"$PUBLISH_GATE" <branch>`. `run-frontier.sh` and `integrate.sh`
  refuse to merge, and the frontier refuses to close the ticket, when it is
  unset or exits non-zero.
- `KRN_INTENT_ID` — required when the Git-ref queue is active. The host supplies
  the current outcome identity from its authority owner; the lane reads its
  stored revision through `krn ticket intent get`. Optional `KRN_INTENT_REVISION`
  asserts that the host's revision is still current when the frontier starts.
  The outcome owner advances revisions with `krn ticket intent set` and an
  expected-revision compare-and-swap when accepted intent changes. The lane
  never guesses outcome identity or revision from task prose.

The worker runs inside a private clone under `$RUN_DIR/wt`. The fixture and the
shared git common directory are bound read-only; only the run directory and the
clone are writable. The host fetches the worker branch back into the fixture
refs before the worker gate. The file-based compatibility route can use
`integrate.sh`. In active-store mode, `run-ticket.sh` copies the
two queue refs into the independent clone so read-only gates see the same task
snapshot. `run-frontier.sh` creates a merge commit candidate without moving the
target ref, runs the typed deciding check and `changes check` on that candidate,
prepares an operation under `.krn/runs/`, updates the target ref with expected-old
CAS, then closes the task only after the same operation reads back the candidate.
If recovery finds the target ref already at the candidate, a new claim
generation can record that observed effect; it never retries an unknown effect.
The file-based compatibility route still uses the configured `TICKETS` path and
legacy close receipt until the queue cutover is complete.

## Isolation and the red preflight

Before a lane starts, `run-ticket.sh` executes the declared check as declared: a
bare path through `node --test`, an `npm run <script>` through npm. It requires a
real TAP failure (`classification=red`); a load or setup error (`Could not
find`, `Cannot find module`, `ERR_MODULE_NOT_FOUND`, `MODULE_NOT_FOUND`,
`SyntaxError`) is `classification=refused-setup` and aborts with a distinct
non-zero exit. A check that already passes is not a flip and is refused too.

The sandbox probe reports `hosthome`, `canary`, `fixture_write`, and `ref_update`
lines; any write or ref update that succeeds, or a visible host home, fails the
preflight closed. `probe-verdict` implements that verdict without bwrap, so the
rule stays testable on a host without a sandbox.

## Contract

Read `run-ticket.sh` for the envelope-driven base/scope/check/contract/agent
handling, the single commit trailer set (`Ticket:`, `Change-contract:`, `Recall:`),
the host-executed worker gate, and the integrator handoff. The publication-mode
integrator (ADR 0004 Tier 1d) is a later ticket.
