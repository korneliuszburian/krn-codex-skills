# Current Matt Pocock skills delta

Status: no applicable upstream mechanism found. Verified: 2026-09-10.

## Question and local consumer

Does the difference between KRN's configured
[`6654f6b`](../../config/upstream-sources.json) pin of
`mattpocock/skills` and its current upstream default branch provide a new skill
or materially changed routing that a KRN Codex-only global workflow or the
source-only frontend package can consume?

**Disposition:** none. There is no install, enablement, migration, or pin-update
proposal from this check.

## Primary-source observations

| Claim | Evidence |
|---|---|
| The configured upstream fixed point is `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`. | [`config/upstream-sources.json`](../../config/upstream-sources.json) |
| GitHub identifies `main` as the upstream default branch; at verification it resolved to `3cca18b368ae95cdbdebbff572ccafa662551015`. | [Repository API](https://api.github.com/repos/mattpocock/skills), [current tree](https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015) |
| The official comparison is two commits ahead of the pin and changes only `CLAUDE.md` and `scripts/link-skills.sh`. | [GitHub comparison](https://github.com/mattpocock/skills/compare/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76...3cca18b368ae95cdbdebbff572ccafa662551015) |
| The substantive commit excludes `misc/` from upstream's developer-only local-link helper while retaining its treatment of `in-progress/`; it adds no skill or routing owner. | [Commit `8666e05`](https://github.com/mattpocock/skills/commit/8666e05d641f6922993616e92c0cf54a85080bd7), [current helper](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/scripts/link-skills.sh) |

## KRN inference and boundary

KRN consumes the composed set at a fixed commit and its own immutable Codex
installer does not invoke upstream's developer link helper. Its source-only
frontend package is KRN-owned and no changed upstream path adds or changes a
frontend workflow. Therefore the observed helper exclusion has no concrete
local consumer and must not alter KRN's routing or installation surface.

This is an inference from the cited upstream delta plus the local configured
boundary, not a claim that the helper is unsafe or ineffective for its upstream
maintainers.

## Limits and reopen falsifiers

This is a point-in-time comparison of the public `main` branch only. It does
not assess unpublished branches, later commits, quality of the upstream helper,
or whether another KRN consumer will be introduced.

Reopen this finding if a later upstream comparison changes `skills/**`, a
routing/invocation document, or an installer contract; or if KRN explicitly
adopts a consumer for the upstream helper. Any such change needs its own named
consumer and source-to-decision disposition before a pin, installation, or
migration change.
