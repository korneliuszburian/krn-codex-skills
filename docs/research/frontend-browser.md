# Agent browser decision

## Decision

Adopt the official `playwright-cli` as the canonical browser control plane for
KRN's future `engineering-full` frontend profile. Keep Vercel's
`agent-browser` as an optional diagnostics/provider adapter, not a second
always-on browser surface. A single delivery run must have one browser daemon,
one session identity and one ref map.

## Local evidence

- `playwright-cli` is installed locally at version 1.62.1.
- `agent-browser` is installed locally at version 0.31.1.
- Chromium is available locally.
- Neither tool was opened against the active Ekologus instance.
- The local `playwright-cli` wrapper currently resolves Playwright through
  `npx --yes --prefer-online`; this is not a suitable final execution path for
  a high-throughput evidence loop because it can add startup/network noise.

## Why Playwright CLI is canonical

Playwright's official agent CLI uses a persistent daemon, isolated sessions,
accessibility snapshots with short element references, and concise command
output. Its official documentation positions CLI + skills as the lower-token
choice for coding agents compared with MCP, while MCP remains appropriate for
specialized persistent exploratory loops.

That matches KRN's needs: the agent can act through compact refs, while the
pipeline owns the durable evidence envelope and gate rather than injecting a
large live page tree into every reasoning step.

The final adapter should pin the Playwright CLI version per repository and use
the local package with `--no-install` (or a direct resolved binary), never a
floating online lookup on every action.

## Where agent-browser fits

`agent-browser` exposes useful diagnostics that should be available behind an
adapter when required: axe-based accessibility audits, console/errors, HAR and
network inspection, traces/profiles/video, React inspection and Web Vitals. It
also uses accessibility snapshots and refs, so it is a strong implementation
option for a diagnostics-heavy project adapter.

It must not run beside Playwright CLI in the same delivery session. Separate
daemons can produce separate tabs, storage, snapshots and ref identities. The
pipeline should select one provider per run and record that provider in the
evidence manifest.

## Proposed KRN browser contract

The generic browser adapter exposes only:

- `open` with a project-scoped session and allowed-origin policy;
- `observe` returning compact accessibility refs plus URL/title;
- `act` using a fresh ref or explicit semantic locator;
- `capture` producing screenshot, DOM/ARIA, geometry, console, network/assets,
  interaction and optional a11y/performance artifacts;
- `trace` for provider-native trace/video/HAR outputs;
- `close` with a cleanup receipt.

Credentials, storage state, browser profile, runtime URL and allowed domains
are project-local adapter inputs. They never belong in the global profile.
KRN hashes every emitted artifact and gates on session identity, current URL,
viewport, provider, freshness and cleanup status.

## Token and action policy

- Use compact accessibility snapshots, not full HTML, for normal agent steps.
- Re-observe after DOM-changing actions; refs are not durable across state
  changes.
- Prefer semantic refs/roles and project test IDs over brittle CSS/XPath.
- Keep screenshots for visual proof, not as the sole interaction signal.
- Capture verbose diagnostics only at a gate boundary or on failure.
- Never expose two browser MCP/CLI tool surfaces in the same global session.

## First browser vertical slice

On a neutral fixture repository, not Ekologus:

1. open a project-scoped Playwright CLI session;
2. observe and perform one interaction using a ref;
3. capture the required evidence envelope;
4. hash and validate the manifest;
5. tamper with one artifact and prove the gate rejects it;
6. close the session and prove cleanup was recorded.

Only after this passes should `engineering-full` enable Playwright CLI skills.
Agent-browser diagnostics and design-specific Figma tooling remain opt-in
extensions of the same adapter contract.

The first neutral fixture now exercises a config-driven adapter at
`scripts/frontend-browser-evidence.mjs`; the fixture contributes only a local
HTTP server and a config file. Its falsifier is executable through the root
`test:frontend-browser` command.

## Sources

- Playwright CLI introduction: https://playwright.dev/agent-cli/introduction
- Playwright CLI skills: https://playwright.dev/agent-cli/skills
- Playwright CLI configuration: https://playwright.dev/agent-cli/configuration
- Microsoft Playwright CLI repository: https://github.com/microsoft/playwright-cli
- Vercel agent-browser command reference: https://github.com/vercel-labs/agent-browser/blob/main/skill-data/core/references/commands.md

## Non-proofs and reopen conditions

Official token-efficiency claims do not prove lower cost for KRN's specific
pages. Local version presence does not prove browser reliability. Reopen this
decision if the fixture shows Playwright CLI cannot emit the required evidence,
if ref/session identity is unstable, or if a dual-provider adapter demonstrably
reduces cost without compromising evidence binding.
