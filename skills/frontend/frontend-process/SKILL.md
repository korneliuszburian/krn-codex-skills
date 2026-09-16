---
name: frontend-process
description: Run the forced frontend build workflow — plan, disposable prototype, HTML-first, tokens and global CSS, compositions, utilities, blocks, exceptions, flair, verification — with an exit per phase. Use for a new page or build; skip design intake and lint setup.
---

# Frontend build process — forced workflow

Build order is not optional. Every phase has an exit criterion; the next phase must not start before it is met.

## <required> — before writing production CSS

1. Run Phase 0 (plan). NEVER dive into production CSS from a raw design.
2. IF any layout/technique is unproven THEN run Phase 0.5 (disposable prototype).
3. Execute Phases 1–10 in order. NEVER skip a phase or exit criterion.

## Phases

### Phase 0 — Plan (no code)
- IF a design file exists THEN review it first for oversights: contrast, tab order, per-viewport inconsistencies, unbuildable complexity — and negotiate simplifications BEFORE coding.
- IF hover/focus states or small-viewport frames are missing THEN request them once; IF unanswered THEN ship the minimum mandatory states (focus, hover for interactive elements) with the exact fancy treatment deferred to the flair pass. NEVER leave interactive elements without focus/hover feedback; NEVER invent a full states spec the design never had.
- IF the design specifies no colors/fonts THEN use minimal neutral system defaults (system-ui, black/white/grays) and say so in the handoff message. NEVER invent a brand palette.
- Produce a sketch-up: layouts → shared layouts → content regions → global-style candidates → discussion items. NEVER make it neat.
- IF a type/space scale is missing THEN derive fluid min/max tokens and get sign-off on tolerance (a pixel or two).
- Split the work: core build items vs flair pass items (decorative/risky → flair).
- EXIT: sketch-up exists; oversights fed back; fluid tokens agreed.

### Phase 0.5 — Disposable prototype (only for risky layouts)
- IF a layout is unproven (unusual alignment, sticky/overflow behavior, breakout elements) THEN build a throwaway prototype: semantic HTML from day one, black-and-white, sans-serif, pixel sizes, magic numbers — global → composition → block CSS order.
- IF the prototype fails THEN report the blocker, re-sketch, re-prototype. NEVER silently hack around a failed approach in production.
- NEVER refactor prototype code into production. NEVER make the prototype pixel-perfect with real tokens — it derails review focus.
- Prototype carve-out: junk CSS in a DISPOSABLE prototype is exempt from the token/lint/specificity rules (magic numbers, px, raw colors are the point). The exemption ends when code enters production — production files never inherit prototype code.

### Phase 1 — HTML structure first
- Build the entire page/view as semantic HTML: logical source order, real headings/landmarks, alt text (empty only for decorative), skip links; minimum viable experience; no client-JS interactivity yet.
- Scaffold the pattern-library structure and component data contracts now.
- EXIT: unstyled page fully functional and readable; tab order correct by source order alone.
- NEVER write component CSS in this phase. NEVER fix bad structure with CSS later.

### Phase 2 — Tokens + global CSS
- Define tokens and `:root` variables; build the foundations page (colour/contrast/fonts/leading/type/space) and a11y-test the palette; write global element styles including the `:focus-visible` system.
- EXIT: kitchen-sink page of every HTML element looks correct with zero block CSS; contrast + focus verified.
- NEVER style buttons/form controls globally (they are `.button` blocks). NEVER skip focus styles.

### Phase 3 — Compositions → Phase 4 — Utilities
- Implement compositions (flow, cluster, repel, sidebar, switcher, grid, wrapper) then one-job utilities (region, visually-hidden) — all configurable via custom properties with fallbacks.
- EXIT: every sketch-up layout has a composition; layouts wrap naturally without media queries.
- NEVER hard-code layout in blocks. NEVER multi-purpose utilities.

### Phase 5 — Blocks (core build)
- Build core components smallest pieces first: element classes, no layout, colors inherited from context, every presentational property a knob.
- IF a decorative/risky variant arises THEN defer to the flair pass with a simple core fallback.
- EXIT: core build complete — "good looking, but far from complete".
- NEVER write flair (animations, sticky tricks, container-fill text, striping) in core. NEVER let a block do layout.

### Phase 6 — Exceptions
- Add `[data-*]` variants/states on compositions and blocks; document each.
- NEVER exceptions that require high specificity.

### Phase 7 — Page composition (markup-only)
- Compose pages from patterns + compositions + utilities. No new block CSS while composing.
- NEVER write new CSS in this phase. NEVER chase Figma parity after agreed changes — the website is the source of truth.
- IF you tune a utility to a non-obvious value in markup THEN add a comment explaining why.

### Phase 8 — Flair pass
- Add decorative treatments, progressive enhancement, JS, animations; re-verify focus/keyboard behavior of new treatments.
- IF a new idea arrives mid-production and is out of scope THEN move it to the Icebox with notes. NEVER rush half-baked features in — that is how technical debt happens.
- EXIT: review invite with explicit feedback scope.

### Phase 9 — Verify → Phase 10 — Document
- Verify token-accurate values, contrast/focus, tab order, no prototype leftovers. IF a deadline forced a compromise THEN log it in the refactor backlog.
- Document: "why" comments on non-obvious CSS; composition knobs in file header + pattern library.
- NEVER ship undocumented non-obvious CSS. NEVER claim self-documenting code.

## Design-process context (when designing, not building)
- Content first: list real content in priority order before any layout. NEVER wireframes first — they become "colour in the wireframe" traps; NEVER lorem ipsum.
- Prototype in the browser, not Figma: "you simply cannot visualise a web design until it is an actual website". Everything in the design phase is disposable.
- Dark mode during design: separate URL per theme for side-by-side feedback; the toggle is production-phase work.

## Final checklist
- [ ] Plan and sketch-up exist before any production CSS
- [ ] HTML structure came first and is semantic
- [ ] Global CSS verified on the kitchen sink before any block
- [ ] Core build complete before any flair
- [ ] Out-of-scope ideas are in the Icebox, not in the build
- [ ] Verification checklist from `frontend-enforcement` passed

## References
- [references/workflow.md](references/workflow.md) — full phase evidence with sources (course lessons, Set Studio blog).
