#!/usr/bin/env python3
"""Integrator capsule writeback (mechanical fields only).

Rewrites the fixed point, evidence, and next action of one outcome capsule
after an integration, leaving semantic fields to the sole writer. Exits
non-zero when a required field line is missing, so a silent no-op is impossible.
"""
import sys
from pathlib import Path

FIXED = "Repository base, HEAD or working-tree fingerprint, and dirty-state scope"
EVIDENCE = "Evidence observed"
NEXT = "Next bounded owner and action"


def main() -> int:
    if len(sys.argv) != 6:
        print("usage: capsule-writeback.py <capsule> <base> <head> <evidence> <next>", file=sys.stderr)
        return 64
    capsule, base, head, evidence, next_action = sys.argv[1:6]
    path = Path(capsule)
    lines = path.read_text(encoding="utf-8").split("\n")
    seen = {FIXED: False, EVIDENCE: False, NEXT: False}
    for index, line in enumerate(lines):
        if line.startswith(f"{FIXED}:"):
            lines[index] = f"{FIXED}: base={base}; HEAD={head}; dirty=clean"
            seen[FIXED] = True
        elif line.startswith(f"{EVIDENCE}:"):
            lines[index] = f"{EVIDENCE}: {evidence}"
            seen[EVIDENCE] = True
        elif line.startswith(f"{NEXT}:"):
            lines[index] = f"{NEXT}: {next_action}"
            seen[NEXT] = True
    missing = [label for label, present in seen.items() if not present]
    if missing:
        print(f"capsule is missing required fields: {', '.join(missing)}", file=sys.stderr)
        return 65
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"writeback: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
