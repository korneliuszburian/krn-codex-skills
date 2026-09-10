---
name: unlazy
description: Keep explicitly requested long or multi-phase work honest with a machine-checked gate ledger, explicit command approval, and re-verification before completion; skip small focused edits.
---

# Unlazy

Use this skill only when explicitly attached for long, multi-phase, unattended,
or explicitly exhaustive work. Skip it for a small edit with a clear focused
check.

The ledger makes completion visible. It does not make commands safe or create a
sandbox. Approval means that the exact command, expectation, working directory,
shell, timeout, `PATH`, platform, Node version, and inherited environment hash
were reviewed. It does not grant
filesystem, network, credential, publication, or merge authority.

## 1. Create the ledger

Create one run directory under:

```text
.krn/runs/unlazy/<run-id>/GATES.md
```

Keep the run private and ignored. Every gate must name one observable outcome:

```markdown
# Gates: <deliverable>

OWNS: <repository-relative paths>
Scope: <one complete outcome>

- [ ] G1: <observable result>
  CHECK: node ~/.agents/skills/unlazy/scripts/gate-check.mjs --status GATES.md
  EXPECT: result verification passed
  EVIDENCE: pending

- [ ] G2: <manual decision no command can settle>
  EVIDENCE: pending
```

Use unique IDs. A runnable gate has both `CHECK` and `EXPECT`; a manual gate
has neither. Keep `EVIDENCE` on every gate. Use `ABANDON: <id> <reason>` only
when the outcome is genuinely impossible, and report that abandonment.
The parser rejects unknown indented attributes, malformed `CHECK`/`EXPECT`/
`CWD`/`EVIDENCE` indentation or delimiters, empty explicit attributes, and
malformed `ABANDON` directives rather than treating them as prose. `CWD`, when
provided, must be a repository-relative directory that resolves inside the
repository; absolute, traversal, missing, and escaping-symlink paths are
invalid.
Before writing the ledger, verify that its path is ignored by Git. The checker
refuses to write evidence for a trackable ledger. If `CWD` is omitted, commands
run from the repository root; set `CWD` to a repository-relative directory only
when the gate needs another location.

For example:

```bash
git check-ignore -q .krn/runs/unlazy/<run-id>/GATES.md
```

## 2. Inspect before running

Run status mode first. It parses the ledger without executing commands or
writing evidence:

```bash
node ~/.agents/skills/unlazy/scripts/gate-check.mjs --status \
  .krn/runs/unlazy/<run-id>/GATES.md
```

Read every `CHECK`, the scripts it calls, its `CWD`, and its expected output.
Do not approve a command you have not inspected.

## 3. Approve and execute deliberately

When the exact commands are understood, approve and run the ledger:

```bash
node ~/.agents/skills/unlazy/scripts/gate-check.mjs --approve \
  .krn/runs/unlazy/<run-id>/GATES.md
```

Approval records live outside the repository, and the checker rejects an
in-repository approval directory. Set `KRN_UNLAZY_APPROVAL_DIR` when a separate
state root is required. The checker records exit status, expectation match,
and capped output in the ledger. A checked manual gate with `EVIDENCE: pending`
is invalid, and an unchecked manual gate remains unmet until its human evidence
is recorded. Before executing, the checker requires the approval record to be a
regular, single-link JSON file whose binding exactly matches the current
command, expectation, working directory, timeout, and environment. Empty,
malformed, changed, directory, or symlinked records remain unmet and are never
repaired or executed automatically; obtain a fresh explicit approval in a new
approval state when the reviewed environment changes.

## 4. Re-verify before reporting

Re-run all runnable gates, including gates that were already marked met:

```bash
node ~/.agents/skills/unlazy/scripts/gate-check.mjs --reverify \
  .krn/runs/unlazy/<run-id>/GATES.md
```

Report met, unmet, and abandoned gates. Never report the outcome as complete
while a required gate is pending, failed, or missing evidence. Delete the run
when its owning workflow finishes or the Goal closes.
