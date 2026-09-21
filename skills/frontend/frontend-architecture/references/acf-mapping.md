# ACF mapping — fields, optionals, semantics, and tokens

Each block becomes one Flexible Content layout. Presentation fields use approved
tokens or profiles; semantic and structural fields use finite domain choices, so
the editor never chooses a raw CSS value.

## Per-block layout

- **Layout name** — the block name (`hero`, `text`, `media_content`, `cta`).
- **Required fields** — the minimum the block needs to render.
- **Optional fields** — present-or-absent content (eyebrow/corner, button,
  media). The template renders nothing when they are empty.
- **Variant selector** — an explicit choice mapped to a `data-*` attribute. The
  default variant is the common case.

## Field mapping rules

- Tokens govern presentation values, not every editor choice. Heading visual
  role, spacing, and color role come from the token layer or a reviewed profile
  map (reuse `inc/token-fields.php`); never expose free-form CSS values.
- A heading's semantic heading level (`h1`–`h6`) follows the document outline.
  Its visual role is a separate approved token/profile choice. Changing either
  one never silently rewrites the other.
- Structural choices such as media position, content presence, and layout mode
  are finite code-owned options. They may map to `data-*` state or renderer
  behavior without masquerading as design tokens.
- Media fields offer the media plus its position when the block has more than one
  position variant.

## Example

| Block | Layout | Required | Optional | Variant |
|---|---|---|---|---|
| hero | `hero` | heading, semantic heading level, visual role, media | button, eyebrow | `primary` (bg image) / `secondary` (image right) |
| text | `text` | heading, semantic heading level, visual role | eyebrow, rich text, button | `split` when beside media |
| media_content | `media_content` | media, rich text | heading, button | media position left/right |
| cta | `cta` | heading | rich text, button | — |

## Exit

Every matrix row in `components.md` names its layout, its required and optional
fields, and its variant. A block without this row is not ready to build.
