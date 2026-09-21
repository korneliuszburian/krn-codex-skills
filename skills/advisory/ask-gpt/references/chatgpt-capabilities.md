# ChatGPT surfaces the prompt may name

A static inventory, so the prompt names the right surface and does not assume a
capability the chat does not have. Update this page when a surface or a
connector changes.

| Surface | What it gives the analysis | Name it when | Limits to state |
|---|---|---|---|
| GitHub connector | Live, on-demand read of the permitted repositories: code, README, and other docs, retrieved when the prompt asks | the question needs cross-file or cross-history reasoning | it reads the pushed commit, not the working tree; it is read-only; it cannot run the repository's gates |
| Projects and files | Persistent project context plus attached documents | the analysis needs a decision, a spec, or a corpus outside the repository | an attached file is a snapshot, not a live source |
| Code interpreter | Executing a small snippet the model writes | a claim is cheap to falsify by running a snippet | it runs in the chat's sandbox, not on the repository host |
| Web browsing | Current external facts and documentation | the question depends on a library version or an external contract | cite the source and date; browsing is not repository evidence |
| Deep research | Multi-source synthesis over public material | the question is a landscape or prior-art question | it does not treat the private repository as its source |
| Agent mode | A browser-capable agent that can act on signed-in sites | the answer needs a live web action, not repository reasoning | its actions are outside the repository and outside our proof; treat them as unverified |
| Work event-triggered task | A recurring task that fires on connected-app events | the work should start from an event rather than a paste | it runs in Work on eligible paid plans; write actions may pause for approval |

## The GitHub connector in full

This is the surface `ask-gpt` usually names. Its real shape, so the prompt is
honest about what the connector can and cannot do:

- **Live, on-demand read.** The connector retrieves permitted repository content
  when the prompt asks; it does not build a synced or separately configured
  index. A repository that GitHub's own search index has not seen may be
  invisible until it is indexed.
- **What it reaches.** Code, README files, and other documentation, found by
  search queries the model forms from the prompt. Treat file-level detail as
  retrieval-dependent: ask for `path:line` and a quoted fragment so the local
  check is cheap.
- **Read-only, by design.** The GitHub app only reads; it cannot create commits,
  branches, or pull requests. Writing to GitHub is Codex's job, not the
  connector's. So a repository-review prompt can ask for a described change but
  must never expect the connector to apply one.
- **Availability varies.** The connector can be available in some experiences
  (deep research, agent or Work) and not in standard chat, depending on plan and
  workspace. State which surface you are relying on.
- **Authorization is per repository.** Access is granted when the ChatGPT
  GitHub app is installed and repositories are selected in GitHub; an
  organization owner can block or change that. An IP allow list on GitHub can
  also block the connector.
- **The pushed commit is the only state.** The connector sees the remote, not a
  local working tree, so an uncommitted or untracked change is invisible and the
  analysis silently misses it. Pin the commit and publish before sending.

## The write path, and event triggers

When the work needs a write or an automatic start, name the right tool instead
of stretching the connector:

- **Codex** generates, edits, and pushes code, and opens pull requests. It is the
  supported write path to GitHub. The separate `managing-codex-capabilities`
  skill owns the surrounding capability control, not this page.
- **Work event-triggered tasks** can respond to GitHub pull-request activity
  (opened, marked ready for review, or closed; reviews, comments, commit
  updates, and merges, depending on the trigger) and start the analysis without
  a manual paste. They run in Work on eligible paid plans, are limited to
  authorized repositories, and a write action may pause until the operator
  approves it.
- **Custom apps and MCP connectors** can add tools, but only on eligible plans
  and workspaces; do not assume them without checking the account.

## Rules for the prompt

- Name only the surface the analysis needs; naming all of them invites the
  model to reach outside the repository and dilute the evidence bar.
- State the limit beside the name: "via the GitHub connector at commit `<sha>`,
  which cannot run our gates".
- Ask for the connector's view to be quoted as `path:line`, so a claim about a
  file is checkable locally.
- Never ask the model to run or claim to run a repository command; the code
  interpreter is for a snippet the model writes, not for our gates.
- When the answer depends on a live host or an uncommitted tree, put it in Open
  questions rather than a finding.
