---
name: managing-codex-capabilities
description: Audit, profile, enable, or disable global Codex skills, plugins, MCP servers, and app surfaces through the KRN capability catalog. Use for token-heavy integrations, stale overrides, usage evidence, or capability collisions; skip project-local skills and ordinary skill authoring.
---

# Managing Codex Capabilities

Treat global capabilities as a **reviewed surface**, not an accumulating pile of
version-pinned overrides. Inventory discovers what can exist, usage supplies
bounded evidence, a profile declares intent, and the reconciler owns the local
Codex configuration change.

1. **Map the requested surface.** Run `krn-codex-catalog inventory` for
   global skills and cached plugin candidates. Run
   `krn-codex-catalog usage --days DAYS` only when actual-use evidence would
   change the decision.

   Keep project-local skills with their repository. Treat app and connector
   state as report-only: local TOML does not own account connections.

   **Done when:** the global capability, its owner (skill, plugin, or MCP), and
   any separately connected app are distinguished.

2. **Choose one complete profile.** Inspect it with
   `krn-codex-catalog profile show PROFILE`, then run
   `krn-codex-catalog plan PROFILE`. Use `lean` for daily engineering;
   select `design`, `web-qa`, or `comms` only for that focused session.

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
   changes, run `krn-codex-catalog apply PROFILE` once. Do not hand-edit the
   generated blocks after a successful apply; change the profile policy and
   re-plan if the intended state is wrong.

   The apply path must retain its concurrency guard, `0600` backup and temp
   files, and atomic rename. Never inspect a hard-quarantined path while
   explaining or repairing a refusal.

   **Done when:** apply reports its backup and the same profile immediately
   passes `krn-codex-catalog check PROFILE`.

4. **Verify in a new session.** Restart Codex, confirm the intended plugin,
   MCP, and skill surface, and report any app that still needs separate account
   disconnection. Current sessions retain their startup capability index.

   **Done when:** the fresh session matches the profile, any connector gap is
   explicit, and no second apply is required.
