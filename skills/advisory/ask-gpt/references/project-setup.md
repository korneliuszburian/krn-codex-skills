# Optional ChatGPT project context

A ChatGPT project can share chats, uploaded files, instructions, and connected
sources across repeated questions. Use one when that shared context saves real
work; a single bounded question can use a chat without a project. The repository
remains the authority for its rules, vocabulary, code, and decisions.

## Before naming a project in a prompt

1. Confirm the operator's chosen project and the GitHub connector's access to
   the intended repository. Connector authorization is checked separately from
   project membership.
2. Keep project instructions about the advisory answer: scope, citation format,
   uncertainty, and return to the local owner. Point to the repository's
   published fixed point for current engineering rules instead of copying them
   into a second maintained rule set.
3. Attach a file only when the question needs context outside the connector.
   Name its version and treat it as a snapshot; refresh or remove it when the
   source changes.
4. State in the prompt which sources the chat can actually read. A project
   does not make a local working tree visible to the remote GitHub connector.

**Done when:** the project adds needed shared context, its connector scope is
verified, and no project instruction or attachment is presented as newer than
the repository source it describes.

The [OpenAI Projects documentation](https://learn.chatgpt.com/docs/projects)
describes projects as shared context for related chats. It does not establish
an append-only repository memory contract.
