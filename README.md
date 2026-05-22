# krn-codex-skills

Codex-native skill pack for fast, disciplined coding and shipping.

This repo is a small operating system for Codex work: repo instructions, reusable skills, narrow subagent roles, and source inspirations. The goal is not to add a giant prompt. The goal is to make the right workflow load at the right time and force real verification before shipping claims.

## What Is Inside

- `.codex/skills/` - project-local Codex skills.
- `.codex/agents/` - narrow Codex subagent roles.
- `.codex/config.toml` - project-scoped skill registration.
- `AGENTS.md` - always-active repo contract.
- `docs/agents/` - operating model and onboarding notes.
- `inspirations/` - vendored source material used to evolve this pack.

## Skills

- `$coding-system` - top-level loop from intent to verified delivery.
- `$grill` - stress-test plans against code reality, `CONTEXT.md`, and ADRs.
- `$debug` - reproduce-first debugging and regression locking.
- `$implementation` - surgical implementation in vertical slices.
- `$review` - defect-focused review before shipping.
- `$handoff` - compact continuation context for another session or agent.

## After Cloning

1. Clone the private repo:

   ```bash
   git clone https://github.com/korneliuszburian/krn-codex-skills.git
   cd krn-codex-skills
   ```

2. Start Codex from the repo root and trust the project when prompted:

   ```bash
   codex
   ```

3. Verify Codex loaded the repo contract:

   ```text
   Summarize the current instructions and list available project skills.
   ```

4. Use the top-level skill for non-trivial work:

   ```text
   Use $coding-system to plan and execute this change.
   ```

5. Use `$grill` before coding when the plan, terminology, ownership, or acceptance criteria are still fuzzy:

   ```text
   Use $grill to challenge this plan against the repo docs and code.
   ```

## Installing Into Another Repo

For project-local use, copy these files into the target repo:

```bash
cp -R .codex AGENTS.md docs/agents /path/to/target-repo/
```

Then start Codex from the target repo root. Keep the skill names unchanged unless you also update `.codex/config.toml` and `AGENTS.md`.

## Evolving The Pack

Use semantic commits only:

```text
feat: add new skill
fix: tighten debug workflow
docs: update onboarding
refactor: simplify skill references
chore: refresh vendored inspirations
```

When adding or changing a skill:

1. Keep `SKILL.md` concise.
2. Put detailed formats and examples under `references/`.
3. Register the skill in `.codex/config.toml`.
4. Add it to the skill map in `AGENTS.md`.
5. Validate it:

   ```bash
   python3 /home/krn/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/<skill-name>
   ```

## Verification

Validate all local skills:

```bash
for d in .codex/skills/*; do
  python3 /home/krn/.codex/skills/.system/skill-creator/scripts/quick_validate.py "$d"
done
```

Validate TOML files:

```bash
python3 - <<'PY'
import tomllib
from pathlib import Path

for p in [Path(".codex/config.toml"), *Path(".codex/agents").glob("*.toml")]:
    tomllib.loads(p.read_text())
    print(f"OK {p}")
PY
```

## Inspirations

The files under `inspirations/` are source material, not runtime configuration. Translate ideas into Codex-native surfaces instead of copying Claude-specific assumptions directly.
