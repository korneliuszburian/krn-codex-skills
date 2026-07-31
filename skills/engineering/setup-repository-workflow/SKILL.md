---
name: setup-repository-workflow
description: Set up or condense one repository's durable agent workflow, instruction ownership, tracker boundary, and mechanical gates. Use explicitly for repo adoption or repair; skip normal delivery and global capability installation.
---

# Setup Repository Workflow

Create the smallest durable repository contract that lets normal Codex workflows
operate without copying them. **This is bounded setup work, not a recurring
orchestrator and not an implementation lane.**

1. **Fix the adoption boundary.** Identify the repository, ref, desired
operator outcome, write authority, dirty-state ownership, and publication
boundary. When the repository is not the active checkout, use
`$target-repo-work` before inspecting or changing it.

   <repository-setup-contract>
   Repository and ref:
   Operator outcome:
   Existing instruction and tracker owners:
   Owned paths:
   Allowed local mutations:
   Publication authority:
   </repository-setup-contract>

   **Done when:** unrelated work is preserved and every proposed setup path has
   an explicit owner.

2. **Explore before adding files.** Read the closest instructions,
existing agent configuration, build and test entrypoints, tracker, CI, and host
policy that can affect the requested workflow. Classify each durable rule into
prompt/thread, global instruction, repository instruction, project config,
skill, deterministic guard, CI, or host administration.

   Run
   `node ~/.agents/skills/setup-repository-workflow/scripts/init-repository-workflow.mjs inspect --root <repo>`
   for the repeatable topology pass. As in Matt Pocock's setup, do not assume
   the issue tracker, instruction owner, domain layout, or monorepo shape from
   a generic template.

   When rules currently span competing surfaces or their owner is unclear, read
   [repository-contract.md](references/repository-contract.md) to resolve that
   placement before editing.

   **Done when:** every rule has one semantic owner and duplicated status,
workflow prose, agents, or checkers are identified before replacement.

3. **Present the resolved contract.** Recommend the detected tracker and
   single-context domain layout by default; offer multi-context only when the
   repository actually has monorepo/domain signals. Resolve whether delivery is
   local or strict PR-gated, and show the exact managed instruction block plus
   `.krn/runs/.gitignore` before writing when the user has not already approved
   those choices.

   **Done when:** tracker, domain mode, delivery profile, and instruction owner
   are explicit inputs rather than guesses.

4. **Write the minimum local contract.** Keep `AGENTS.md` limited to repository
language, layout, commands, domain and authority boundaries, required gates,
and genuinely local review expectations. Reuse one semantic instruction file
for other harnesses when they support it. Use `.codex/config.toml` only for
trusted repository settings, not prose procedures.

   Repositories choose their durable tracker. If one exists, define one active
outcome and its WIP rule there; do not introduce Beads, `GOAL.md`, branch
conventions, custom agents, or status documents without a demonstrated local
consumer. Native goals retain long-running session outcome state, and native
plans remain ephemeral.

   When a new Beads tracker is selected, initialize it as a separate,
   commit-capable transition **before** applying this skill's managed files.
   Require a clean worktree and index plus explicit authority for `.beads/`,
   the root `.gitignore`, the exact repository-local Git config key
   `beads.role`, and the local commit that `bd` may create. Run `bd --version`
   first and require the audited `bd version 1.0.4` boundary; stop before
   mutation on any other version. Record `HEAD` (or the unborn-branch state),
   status, repository-local Git config, the hook path resolved by
   `git rev-parse --path-format=absolute --git-path hooks`, and fingerprints
   of any existing `AGENTS.md`, `CLAUDE.md`, and `.claude/`, then run:

   ```text
   bd init --skip-agents --skip-hooks --non-interactive
   ```

   Read back the resulting `HEAD`, commit paths, status, local Git config,
   resolved Git hooks, and instruction surfaces. The only permitted config
   delta is `beads.role=maintainer`; pre-existing instruction and hook surfaces
   remain byte-identical, absent ones remain absent, and `.beads/hooks/` remains
   absent. Stop on any other delta. At the audited boundary this command
   advances `HEAD` even with both skip flags. Do not run without local commit
   authority, and do not substitute `--stealth` for a shared durable tracker.

   After tracker initialization, apply the resolved repository contract with:

   ```text
   node ~/.agents/skills/setup-repository-workflow/scripts/init-repository-workflow.mjs apply --root <repo> \
     --tracker <beads|github|gitlab|local> \
     --domain <single|multi> --delivery <local|strict>
   ```

   Pass `--instruction AGENTS.md` or `--instruction CLAUDE.md` only to resolve
   two independent existing files. When no instruction owner exists, `apply`
   seeds a **thin** `AGENTS.md` (specifics and placeholders only) and symlinks
   `CLAUDE.md` to it — this skill owns the repository brief so a tracker's init
   never fills the void. See [agents-composition.md](references/agents-composition.md)
   for why the brief stays thin, how the harness composes it with the global
   core, and why Beads initialization is isolated from instruction ownership.

   Normalize resumable working state under
   `.krn/runs/<workflow>/<run-id>/`. The initializer installs only the thin
   managed block and this ignored boundary; each creating workflow owns cleanup
   when its named sole in-goal consumer finishes the accepted outcome or the
   owning Goal closes. A short-lived result returns to its active outcome owner;
   when another session must resume it, the owning workflow keeps only its
   workflow-specific artifact in that run and returns condensed continuation
   through the native Goal or configured tracker. Only `$delivery-loop` may
   persist the outcome capsule, at
   `.krn/runs/delivery-loop/<outcome-id>/state.md`. `CONTEXT.md`, `docs/adr/`,
   and `docs/research/` remain absent until active vocabulary, an earned
   consequential decision, or a named research consumer requires them.

   **Done when:** a new session can locate the current outcome and the right
   commands without loading history or a copied global workflow, and a second
   apply produces byte-identical owned files.

5. **Implement only earned enforcement.** Condense or replace competing sources
instead of layering another index over them. Add a script, hook, or CI check
only for a deterministic invariant that can fail and whose enforcement surface
has the required authority. Do not create local executioner or reviewer agents:
scoped changes use `$implement`, unknown failures use `$diagnosing-bugs`, and a
fixed diff uses `$code-review`.

   **Done when:** every managed file changes observable setup behavior, and
   normal delivery still routes to the existing workflow owners.

6. **Prove adoption, then stop setup.** Run the narrowest structural validator
or isolated setup smoke that can reject the changed contract. Re-read the
result from a fresh-session perspective and account for all changed paths.

   <repository-setup-result>
   Installed or repaired surfaces:
   Removed collisions:
   Focused proof:
   Remaining host or owner actions:
   Normal next workflow owner:
   Changed paths:
   Publication state:
   </repository-setup-result>

   **Done when:** the repository contract is usable, setup has no continuing
runtime role, and the next product task belongs to its ordinary workflow owner.
