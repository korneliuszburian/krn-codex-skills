---
name: managing-codex-capabilities
description: Audit and reconcile global Codex skills, token-heavy integrations, and OpenCode capability exposure through KRN profiles. Use for excessive integrations, stale overrides, missing owners, or duplicate generated exports; skip project skill authoring.
---

# Managing Codex Capabilities

Treat global capabilities as a **reviewed surface**, not an accumulating pile of
version-pinned overrides. Inventory discovers what can exist, usage supplies
bounded evidence, a profile declares intent, and the reconciler owns the local
Codex configuration change. The OpenCode adapter projects the same
profile into native skill permissions for each repository.

1. **Map the requested surface.** Run `krn capability inventory` for
   global skills and cached plugin candidates. Run
   `krn capability usage --days DAYS` only when actual-use evidence would
   change the decision.

   Keep authored project skills with their repository. A verified generated KRN
   export may defer to its identical installed owner through a producer-marked
   Codex override; `check` detects when that equivalence is lost. Treat app and connector
   state as report-only: local TOML does not own account connections.

   Preserve the catalog's evidence vocabulary: a profile is `declared`, an
   inventory entry is a `discovered_candidate`, local reconciliation observes
   `configured_enabled`, and bounded positive evidence is `observed_used`.
   Report absence as `no_evidence`, current-session loading as `unknown`, and
   app connection or scopes as `report-only` unless their actual owner supplies
   evidence.

   **Done when:** the global capability, its owner (skill, plugin, or MCP), and
   any separately connected app are distinguished.

2. **Choose one complete profile.** Inspect it with
   `krn capability profile show PROFILE`, then run
   `krn capability plan PROFILE --root REPO`. Use `lean` for daily engineering;
   select `design`, `web-qa`, or `comms` only for that focused session.
   Workflow admission comes from the manifest and pinned companions. Profiles
   own optional additions and exclusions; an unknown global addition defaults
   off. Missing required owners are an incomplete installation, not convergence.

   <capability-decision>
   Requested outcome:
   Selected profile:
   Evidence window and confidence:
   Planned plugin, MCP, and skill changes:
   Report-only connector follow-up:
   </capability-decision>

   A missing usage event is a review signal, never proof that implicit skill
   invocation did not happen. Hard quarantine always outranks a profile.

   **Done when:** the dry-run expresses the requested outcome without changing
   project-local skills or inventing connector authority.

3. **Apply only the reviewed mutation.** When the user requested configuration
   changes, run `krn capability apply PROFILE --root REPO` once. Do not hand-edit the
   generated blocks after a successful apply; change the profile policy and
   re-plan if the intended state is wrong.

   The apply path must retain its concurrency guard, `0600` backup and temp
   files, and atomic rename. Never inspect a hard-quarantined path while
   explaining or repairing a refusal.

   **Done when:** apply reports its backup and the same profile immediately
   passes `krn capability check PROFILE --root REPO`. Reconcile again after an
   export, release, profile, or checkout changes an equivalent owner.

4. **Verify in a new session.** Restart Codex, confirm the intended plugin,
   MCP, and skill surface, and report any app that still needs separate account
   disconnection. Current sessions retain their startup capability index.
   Check OpenCode separately; its adapter uses `KRN_CAPABILITY_PROFILE` or
   `lean`. Name permissions establish visibility and invocation policy, not
   filesystem isolation; project skills and native system defaults stay local.

   **Done when:** the fresh session matches the profile, any connector gap is
   explicit, and no second apply is required.
