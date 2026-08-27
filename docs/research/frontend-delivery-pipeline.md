# Reusable frontend delivery pipeline

## Decision

Adopt an extraction program that turns the Ekologus `./rek` workflow into a
portable frontend delivery core plus explicit repository adapters. Do not copy
Ekologus skills into the global index and do not publish `engineering-full`
until the extracted core passes the same gates in Ekologus and a pristine,
non-WordPress fixture repository.

## Named consumer and owner

- Consumer: the future KRN `engineering-full` profile and its frontend delivery
  skill, with repository adapters as the only project-specific integration.
- Decision owner: KRN harness maintainer; implementation proceeds through
  vertical slices with one writer per slice.
- Tracker: none; this decision is intentionally repository-owned until the
  first implementation slice creates trackable work.

## Local mechanism

Ekologus already exposes a real sequence through `./rek`: component/consumer
mapping, design registry verification, contract preparation, runtime prototype
evidence, compare/gate, build, review and release verification. Its config and
skills also show the boundary that must be preserved: WordPress/ACF, Figma file
identity, runtime URL/theme paths, and CUBE doctrine are project-local, while
artifact identity, digests, evidence completeness, fail-closed states and
release binding are portable mechanisms.

The current project snapshot was inspected at `b7d62420`; the KRN capability
source was inspected at `91ee76f`. Two bounded DeepSeek v4 Flash advisory
passes challenged the extraction plan. Their raw prompts and outputs remain in
ignored goal run state and are not copied here.

## Adopted architecture

```text
generic frontend core
  schemas · digests · artifact lifecycle · compare/gate · release binding
             ↑ explicit adapter contract
repository adapter
  inventory · design provider · runtime capture · build/assets · transport
             ↑ local project contract
project-local skills and AGENTS
  CMS/data authority · routes · tokens · design doctrine · human decisions
```

The generic CLI/core owns lifecycle enforcement. Skills may route, explain and
prepare evidence, but no second skill or adapter may independently mutate gate
or release state. Capture, review and approval identity/policy are declarative
adapter inputs; provider credentials stay outside global capability scope.

## Vertical slices and falsifiers

0. **Seam inventory and protocol decision.** Map every hardcoded CLI surface,
   artifact schema, lifecycle transition, test and current owner. Choose a
   neutral versioned namespace and a legacy translation map. Falsifier: an
   unassigned lifecycle mutation or a project-branded field leaking into a
   neutral artifact.

1. **Neutral packet/gate core.** Extract candidate fingerprint, content digests,
   signed source/measurement manifests and `prepare → compare → gate` with
   blocked/tampered/stale/pass states. Use a tiny fabricated-evidence,
   non-browser fixture. Falsifiers: incomplete matrix, tampered file, stale
   candidate and invalid namespace all fail closed.

2. **Adapter boundary and policy.** Define config for repo/index/build/dist,
   evidence policy, capture identity, review/approval inputs and adapter
   declarations. Move PHP/WordPress inventory, Figma harvest/node rules,
   runtime asset tracing, build execution and capture mechanics behind it.
   Falsifier: a non-PHP/non-npm fixture can invoke the core without project
   imports, while Ekologus output remains compatible.

3. **Pristine fixture parity.** In a clean checkout containing no Ekologus or
   WordPress files, run the complete public path through the fixture adapter:
   prepare, prototype evidence, compare, gate, build, review, approval and
   verify. Falsifiers include missing evidence, undeclared assets/source
   imports, stale candidate, tamper and cross-project contamination.

4. **Ekologus cutover and de-duplication.** Migrate `./rek` onto the core and
   adapter contracts, preserve command compatibility, demote local skills to
   thin project routers, and make CI/release verification use one pure digest
   recomputation path. Falsifier: all existing project gates pass with no
   second lifecycle owner.

5. **Engineering-full profile.** Publish only after cutover and fixture parity.
   Enable generic frontend delivery, CUBE/GSAP, browser and Figma tooling;
   keep WakaTime and GitHub; leave Airtable, Ahrefs, Canva, business
   connectors, credentials and project doctrine opt-in. Falsifier: a fresh
   unrelated repository loads no project skills, tokens, maps, doctrine or
   secrets while completing the public path.

## Explicit non-proofs

- Ekologus's current pipeline is not evidence of portability.
- A green project suite does not prove a generic core.
- Browser screenshots do not prove DOM/runtime/network/interaction correctness.
- A global profile does not authorize project credentials or external accounts.
- Human approval and provider access remain separate authorities.

## Reopen and supersession

Reopen this decision when the seam inventory finds a conflicting owner, the
fixture fails a shared gate, a credential appears in an artifact, or the
distribution/version contract cannot be pinned. Supersede this page only when
an accepted implementation ADR and passing fixture/Ekologus evidence establish
a different core/adaptor boundary.
