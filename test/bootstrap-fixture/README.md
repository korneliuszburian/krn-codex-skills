# Installed-release bootstrap fixture

This fixture is the smallest end-to-end proof of the public bootstrap seam.
It does not install anything on the operator host and does not use network
state during the test.

The test creates a temporary clean source checkout, installs that exact commit
into a temporary `CODEX_HOME`, then invokes the resulting linked
`krn-codex` binary against the disposable `project/` target repository. It
checks:

- the CLI resolves through the immutable release and `current` link;
- `repo inspect` is read-only before setup;
- `repo apply` writes only `AGENTS.md` and `.krn/runs/.gitignore`;
- a second apply is byte-idempotent;
- foreign `LOCAL.md` prose is untouched;
- an unowned managed-file collision fails closed without partial mutation;
- the installed capability catalog remains callable.

Run it from the KRN root:

```bash
npm run test:bootstrap
```

The fixture is a behavior contract, not a product template. Add a new
assertion only for a distinct public acceptance requirement or failure mode.
