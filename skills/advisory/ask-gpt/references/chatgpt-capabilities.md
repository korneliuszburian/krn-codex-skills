# ChatGPT surfaces the prompt may name

A static inventory, so the prompt names the right surface and does not assume a
capability the chat does not have. Update this page when a surface or a connector
changes.

| Surface or connector | What it gives the analysis | Name it in the prompt when | Limits to state |
|---|---|---|---|
| GitHub connector | Read-only access to the repository at a branch or commit, including history and issues | the question needs cross-file or cross-history reasoning | it reads the pushed commit, not the working tree; it cannot run the repository's gates |
| Projects and files | Attached documents and a persistent project context | the analysis needs a decision, a spec, or a corpus that is not in the repository | an attached file is a snapshot, not a live source |
| Code interpreter | Executing small snippets to check an inference | a claim is cheap to falsify by running a snippet (a regex, a parser, a numeric check) | it runs in the chat's sandbox, not on the repository host |
| Web browsing | Current external facts and documentation | the question depends on a library version or an external contract | cite the source and date; browsing is not repository evidence |
| Deep research | Multi-source synthesis over public material | the question is a landscape or prior-art question | it does not read the private repository |

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
