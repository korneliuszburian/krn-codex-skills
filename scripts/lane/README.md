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
- `run-frontier.sh` — loop `next -> claim -> lane -> merge -> close` until the
  frontier is empty or `MAX_RUNS` is reached.
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

The worker runs inside a private clone under `$RUN_DIR/wt`. The fixture and the
shared git common directory are bound read-only; only the run directory and the
clone are writable. The host fetches the worker branch back into the fixture
refs before the worker gate, and `integrate.sh` performs the merge.

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
