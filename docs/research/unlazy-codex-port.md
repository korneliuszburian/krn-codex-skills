# Unlazy port to Codex

Status: `lab-test`, 2026-08-24. Consumer: `$delivery-loop` and long-running
`$source-to-decision` runs. This page records the mechanism and the bounded
Codex port. It does not claim that the external skill is a sandbox or that the
pilot proves better model quality.

## Source and question

Question: can unlazy's completion discipline stop a long Codex task from being
reported as complete while checks or independent review are still pending,
without creating a second lifecycle authority?

Pinned source: [unlazy at commit `754d9a6`](https://github.com/Leonxlnx/unlazy/commit/754d9a68109e39b836cc72a39fb9a823f9d6b613).
The source defines a machine-checked `GATES.md` ledger, explicit command
approval, evidence recording, and re-verification. Its own security note says
approval does not sandbox inherited filesystem, environment, credentials, or
network access.

## Mechanism

The useful mechanism is a small completion ledger:

1. state one observable result per gate;
2. give runnable gates an exact `CHECK` and `EXPECT`;
3. inspect commands before explicit approval;
4. record exit status and decisive output as evidence;
5. re-run every runnable gate before the final report;
6. keep manual gates visible instead of turning missing evidence into success.

The depth-tree and Cursor Stop-hook layers are not part of this port. They need
different orchestration or host capabilities and are not required to test the
completion mechanism.

## Codex port

KRN adds an explicit-only `skills/meta/unlazy` skill. Its checker stores a run
ledger under `.krn/runs/unlazy/<run-id>/` and approval records outside the
repository. It binds approval to the command, expectation, CWD, shell, timeout,
`PATH`, platform, Node version, and an inherited environment hash. It refuses to
write a ledger that Git can track and defaults gate commands to the repository
root. It supports `--status`, `--approve`, and `--reverify`. It makes no sandbox
claim and does not own Goal state, publication, or lifecycle transitions;
`$delivery-loop` remains the lifecycle owner. Every execution also validates the
approval record itself: it must be a regular, single-link JSON file with an
exact binding; malformed, changed, directory, and symlink records fail closed
without running the command. A failed re-verification clears the gate's
checked state and records the failure, so a stale prior success cannot survive
as a completion signal.

## Pilot evidence

The first pilot used the current PR fixed point and four runnable gates for
HEAD, repository validation, experiment regressions, and GitHub CI, plus one
manual gate for an independent review of the exact HEAD.

Observed result:

```text
runnable gates met: 4/4
manual review gate: unmet
completion claim: blocked
model calls: 0
repository mutation: none
```

This is a transport/completion result, not a behavioral skill-quality result.

## Decision and falsifier

Decision: `lab-test` the KRN port on one long real task before making it a
default branch of every workflow. Keep it explicit-only. Do not install the
full external unlazy repository or copy its Cursor Stop hook.

Falsifier: if the port adds more than 30 minutes of operator work to a second
long task without preventing a false completion, stale evidence, or a missed
review boundary, reject the port and retain only the current delivery-loop
fixed-point checks.

Reopen when the pilot has a second real consumer, a measured operator cost, and
one observed completion error that the ledger catches.
