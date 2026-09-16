# Workflow — evidence and detail

## Core build vs flair pass (course lessons 023, 028)
- Core build = system/foundations: tokens, global styles on HTML elements, typography, space, layout compositions, core blocks, simple interaction states, minimum viable experience.
- Flair pass = fun/complex modules, progressively enhanced JS, animations, page compositions, designer snags, "anything that felt like it was slowing me down in the core build".
- "The aim of the game here is to get the foundations solid. Think of it more of an infrastructural process."
- Decorative items (bleed-lines, indents, striping, container-fill text) and risky ones (sticky tricks) → flair, with a simple core fallback (e.g. large type-scale token instead of container-fill text).
- Media queries are flair-pass tools: "the core structure is solid" by then.
- Keyboard check in flair: `.rolodex__list:has(.rolodex__item:focus-visible)` re-enables the docked treatment for keyboard users.

## Disposable prototypes (lesson 024)
- Purpose: prove a layout/feel and focus conversation. Properties: semantic HTML from day one, `font-family: sans-serif`, black and white, pixel sizes, magic numbers, rough media queries.
- "If your theory is that the framework is going to save time, prove it with prototypes" — half an hour in CodePen saves hours in production.
- Pixel-perfect prototypes with real tokens derail review focus from layout to look-and-feel. Never refactor prototype code into production.

## Planning and feedback (lessons 006, 012-013, 015-023)
- "Move slowly and methodically to go fast": skipping research/analysis produced "three grid systems" and unmaintainable components (2019 design-system project).
- Oversight review: contrast, tab/focus order, per-viewport inconsistencies, unbuildable complexity — "the worst will happen". Simplification of the design is the primary tool for maintainable CSS; per-viewport treatments get normalized to one treatment.
- Sketch-up: draw over flat design frames — red = wrappers, blue = flex, green = grid; blue notes = comments, pink notes = pushback. Order: layouts → shared layouts → content regions → global-style candidates → discussion items. Never neat.
- Slice into the smallest reusable pieces: "the smaller the pieces, the less code that is written for each piece".

## Page composition and snags (lessons 051-054)
- Page assembly is markup-only: "website building in easy mode" — patterns dropped into `region flow wrapper grid data-layout='thirds'` + utilities; sections assemble in seconds.
- "Figma is not the source of truth, the website is."
- Snags: present with explicit feedback scope; be honest about hacks; verify token-accurate values before handover; deadline compromises go to the refactor backlog.

## Icebox and documentation (lessons 056-057)
- Icebox = cool storage for ideas that don't fit the phase. "What you don't want to be doing in production is, suddenly introducing new, half-baked ideas. That's how you get technical debt!"
- Documentation: comment the "why" on non-obvious CSS (calc, clip-path, transforms, custom @property, selector tricks); file-header docs for compositions listing every custom property + defaults + exceptions; pattern-library docs for patterns. "There is no such thing as self-documenting code."

## Studio process (web sources)
- 7 design phases in 2 sprints: Sprint 1 = Priority guides → Design research → Creative ideation → Prototype: base; Sprint 2 = Module designs → Prototype: second pass → Design docs; then Design docs → Backlog planning → Timeout. Everything disposable. Source: https://piccalil.li/blog/redesigning-piccalilli-the-first-part-of-the-design-process/ (2024).
- "You simply cannot visualise a web design until it is an actual website" — default to the browser over Figma. Dark mode prototyped as a separate URL; toggle deferred to production. Source: same.
- Production = HTML-only build of the whole site (minimum viable experience, pattern-library scaffold, data contracts, no client JS) → then UI development. Source: https://piccalil.li/blog/redesigning-piccalilli-the-build-process/ (2024).
- Priority guides: real content ordered by user priority, no layout, mobile format, no menu, never lorem ipsum; a discussion tool, not a deliverable. Source: https://alistapart.com/article/priority-guides-a-content-first-alternative-to-wireframes/ (2018).
- Two-week iteration blocks with off-ramps; even personal projects get a checklist before the code editor. Sources: https://set.studio/ ; https://set.studio/blog/an-iterative-process-to-our-agency-website-design/ ; https://piccalil.li/projects/personal-site/1
