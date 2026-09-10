# Reusable frontend delivery evidence

## Current disposition

P7 v2 in [frontend authoring decisions](frontend-authoring.md) supersedes the
former public pipeline and frontend-delivery-skill topology proposed for the
still-active `engineering-full` profile; it does not retire that profile.
This topic retains only reusable evidence mechanisms for a future
frozen behavioral proof. It defines no public workflow owner and authorizes no
profile, installation, migration, release, or project credential.

## Retained mechanism

The Ekologus `./rek` workflow showed a useful separation between portable proof
and repository-specific execution:

```text
candidate identity · content digests · evidence completeness · fail-closed gate
                              ↑ adapter boundary
inventory · design provider · runtime capture · build/assets · transport
                              ↑ project contract
CMS/data authority · routes · tokens · design doctrine · human decisions
```

Only the upper evidence vocabulary is reusable here. Browser capture is an
evidence provider, not a reviewer or acceptance owner. Repository adapters own
runtime paths and provider integration. Project contracts retain CMS/data,
tokens, design doctrine, credentials, and human decisions. No adapter or skill
may independently mutate lifecycle, release, or approval state.

The inspected snapshots were Ekologus `b7d62420` and KRN capability source
`91ee76f`. Advisory prompts and outputs remain ignored workflow state rather
than durable knowledge.

## Conditions for future proof

A future protocol may adopt these mechanisms only when it freezes candidate
identity, tool and adapter versions, fixtures, evidence policy, and stopping
conditions before execution. Its smallest useful falsifiers are:

- incomplete, tampered, stale, or cross-project evidence fails closed;
- a pristine non-WordPress fixture needs no Ekologus imports or doctrine;
- capture remains distinct from visual judgment and human acceptance;
- provider credentials and project-specific paths never enter portable
  artifacts;
- one lifecycle owner recomputes the final candidate and evidence binding.

## Explicit non-proofs

- Ekologus's project pipeline does not prove portability.
- A green project suite does not prove a generic frontend core.
- Browser screenshots do not prove DOM, runtime, network, or interaction
  correctness.
- Static skill and routing validation does not prove model behavior.
- These retained mechanisms do not justify an `engineering-full` profile or a
  frontend delivery skill.

Reopen only when a named frozen protocol needs one of these evidence mechanisms
or a current provider seam contradicts them. Record any new public topology in
the canonical frontend authoring decision, not in this evidence topic.
