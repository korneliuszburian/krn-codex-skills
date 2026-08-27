# Neutral frontend browser fixture

This fixture proves the first browser evidence slice without Ekologus,
WordPress, Figma or a project runtime. It uses one official `playwright-cli`
session and produces a compact evidence packet under `.artifacts/`.

The fixture's `capture.mjs` is only a local server harness. The reusable public
seam is `scripts/frontend-browser-evidence.mjs`, driven by
`browser-evidence.config.json`; another repository can provide the same config
contract without copying this fixture. The config also declares a build command,
dist root and runtime readiness URL; the adapter executes the build, hashes the
dist inventory, starts the runtime, waits for readiness, and shuts it down after
the scoped browser session.

```sh
npm run capture
npm run verify
```

The capture flow opens the local fixture, obtains a ref from the accessibility
snapshot, executes the declared `actions` sequence, captures before/after snapshots and screenshots,
records runtime geometry, console, network and interaction output, closes the
session, and records the remaining session list. `verify.mjs` checks artifact
hashes, the completed state and cleanup. Editing any listed artifact makes the
gate fail.

`.artifacts/` is generated evidence and must stay out of Git; the fixture code
and verifier are the durable contract.

Use `actions` for a scenario. Each action currently supports `kind: "click"`,
an optional accessibility `role`, and visible `text`. The legacy singular
`action` field remains accepted by the adapter.
