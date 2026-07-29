---
name: reviewer-handoff
description: Compile a bounded fixed-point review packet and prompt at the end of implementation when a reviewer needs complete evidence without repository access. Skip implementation, review judgment, second-opinion execution, and publication.
---

# Reviewer Handoff

**Compose the packet; do not become the reviewer.** This skill turns one frozen
repository change into a portable evidence packet. `$code-review` still owns
Standards/Spec judgment, `$second-opinion-review` still owns its checker roles,
artifact directories, schemas, and transport, and `$delivery-loop` still owns
lifecycle and publication.

## Contract

<handoff-contract>
Job: compile one bounded reviewer packet and prompt
Inputs: fixed base/head, explicit changed-path allowlist, filled brief, proof results
Observable output: one portable Markdown packet containing metadata, scope ledger, spec, proof, boundaries, and diff
Completion criterion: fixed-point identity is reproducible, actual changed paths equal the allowlist, diff check passes, and output exists outside fixed evidence inputs or in the initiating workflow's verified ignored pass
Must not own: implementation, approval, findings, merge, push, runtime execution, or secret scanning
</handoff-contract>

Invoke this skill explicitly with `$reviewer-handoff` after implementation and
focused proof, or compose it from `$delivery-loop` before `$code-review` or an
authorized external reviewer. A request to judge the change belongs to
`$code-review`; a request to challenge a claim through Claude belongs to
`$second-opinion-review`.

## Build one packet

1. **Freeze the claim.** Resolve the repository root, exact base and head, and
   the explicit changed-path allowlist. Use a commit fixed point for portable
   review. Do not package a moving working tree as if it were a commit.

   **Done when:** base/head resolve, head identity and parent are recorded, and
   the packet has one repository and one comparison.

2. **Fill the brief.** Copy [reviewer-packet-template.md](references/reviewer-packet-template.md)
   to a private pass directory owned by the initiating workflow and fill its
   authority, spec, acceptance, exact proof results, non-goals, and non-proofs.
   Do not paste secrets, credentials, environment files, private customer data,
   raw proprietary corpus, or unrelated repository prose.

   If the packet will be challenged by `$second-opinion-review`, create the pass
   directory with its `prepare-artifacts.mjs` and keep the brief and output
   inside that pass. The second-opinion checker remains the owner of its
   `checker.md`, `checker.review.json`, fingerprint, and schema validation.

   **Done when:** the brief names the requested decision, evidence authority,
   allowed paths, proof commands/results, and every explicit non-proof.

3. **Compile the fixed evidence.** Run the skill-owned compiler from the
   installed path:

   ```bash
   node ~/.agents/skills/reviewer-handoff/scripts/prepare-review-packet.mjs \
     --base BASE_REF \
     --head HEAD_REF \
     --path path/to/changed-file \
     --brief /private/pass-dir/reviewer-brief.md \
     --working-pass /private/pass-dir \
     --output /private/pass-dir/reviewer-packet.md
   ```

   Repeat `--path` for every allowed path. The compiler fails closed when the
   actual commit diff contains a path outside the allowlist, the diff check
   fails, a ref is invalid, the output already exists, or the diff is too large.
   Omit `--working-pass` only when the output is outside the repository. For a
   repository-local output, supply the absolute initiating pass: the compiler
   resolves `docs/agents/artifact-paths.json` and requires the pass to remain
   beneath its configured `working_runs` role. The output must stay inside that
   non-symlinked, private, Git-ignored pass directory.

   **Done when:** the compiler reports the exact allowlist, fixed-point
   identity, diff check, and output path without reading outside the brief and
   allowed diff paths.

4. **Hand off by role.** Give the resulting packet to exactly one next owner:

   - `$code-review` for independent Standards and Spec review;
   - `$second-opinion-review` with a checker brief when an advisory challenge
     is requested;
   - an external reviewer/bridge when the packet must travel without repo
     access.

   State that the packet is evidence, not approval, and list what it does not
   prove. Never claim reviewer PASS from packet generation alone.

   **Done when:** the consumer, fixed point, packet path, and requested review
   output are named; no second review transport is invented.

5. **Close the artifact.** The initiating workflow owns the private pass root,
   retained packet, brief, and reviewer result. Retain them while the issue or
   follow-up depends on the evidence; then archive the minimal required record
   or delete the pass directory explicitly. The reviewer-handoff compiler does
   not decide retention and writes inside a repository only when the initiating
   workflow supplies its configured, ignored working pass.

   **Done when:** every retained artifact has an owner and cleanup trigger, and
   publication/review status is reported separately from packet generation.
