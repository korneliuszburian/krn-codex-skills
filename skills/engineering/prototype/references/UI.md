# UI prototype

Generate **several radically different UI variations** on a single route,
switchable from a floating bottom bar. The user flips between variants in the
browser, picks one (or steals bits from each), then throws the rest away. If the
question is about logic or state rather than looks, use [LOGIC.md](LOGIC.md)
instead.

## Two sub-shapes — prefer A

A UI prototype is easier to judge when it is **butting up against the rest of the
app** — real header, sidebar, data, density. A throwaway route alone is a vacuum
where every variant looks fine.

- **Sub-shape A — adjustment to an existing page (preferred).** The route already
  exists; variants render on the same route gated by a `?variant=` URL search param.
  Existing data fetching, params, and auth stay; only the rendering swaps. This
  includes new sections that would naturally live inside an existing page — mount the
  variants inside the host page.
- **Sub-shape B — a new page (last resort).** Only when the thing has no existing
  page to live inside. Create a throwaway route following the project's routing
  convention, named so it is obviously a prototype. Same `?variant=` pattern. Before
  committing, sanity-check that there is really no page it could embed in — an empty
  route hides problems a populated one exposes.

## Process

1. **State the question and pick N.** Default to **3 variants**; cap at 5 — more
   stops being radically different and becomes noise. Write the plan in one line:
   "Three variants of the settings page, switchable via `?variant=`, on the existing
   `/settings` route."

2. **Generate radically different variants.** Each variant holds to the page's
   purpose and data, the project's component library / styling system, and a clear
   exported name (`VariantA`, `VariantB`, `VariantC`). Variants must be **structurally
   different** — layout, information hierarchy, primary affordance — not just colour.
   Three slightly-tweaked card grids is wallpaper, not a prototype. If two drafts come
   out similar, redo one with explicit "do not use a card grid" guidance.

3. **Wire them together** with a single switcher on the route: read `variant` from the
   search params (default `A`), render the matching component, and mount the switcher.
   For sub-shape A keep the existing data fetching above the switcher; only the
   rendered subtree changes. For sub-shape B the throwaway route mounts the switcher.

4. **Build the floating switcher** — a fixed-position bar at bottom-centre with a left
   arrow, the current variant label, and a right arrow. Clicking an arrow (or pressing
   `←`/`→`, except when an input/textarea/contenteditable is focused) updates the URL
   search param via the framework router so the variant is shareable and
   reload-stable. Make it visually distinct from the page, and **hide it in production
   builds** (gate on `NODE_ENV !== 'production'`) so a stray merge cannot ship it.

5. **Hand it over.** Surface the URL and the `?variant=` keys. The useful feedback is
   usually "I want the header from B with the sidebar from C" — that composite is the
   actual design.

6. **Capture the answer and clean up.** Once a variant wins, record which and why,
   then fold the winner into real code under `$implement` (prototype code was written
   with no tests or error handling — rewrite it). Move the **full set of variants**
   onto the throwaway branch as the primary source: sub-shape A folds the winner into
   the existing page and drops the losers and switcher from main; sub-shape B promotes
   the winner to a real route and drops the throwaway route and switcher from main.
   Variant components left in main rot fast and confuse the next reader.

## Anti-patterns

- Variants that differ only in colour or copy — that is a tweak, not a prototype.
- Sharing too much code between variants — a shared header is fine; a shared layout
  defeats the point. Each variant must be free to throw out the layout.
- Wiring variants to real mutations — read-only is fine; if a variant must mutate,
  point it at a stub.
- Promoting prototype code straight to production — rewrite it properly when folding
  it in.
