# ACF mapping — fields, optionals, tokens

Each block becomes one Flexible Content layout with token-driven fields, so the
editor configures the block without ever choosing a raw value.

## Per-block layout

- **Layout name** — the block name (`hero`, `text`, `media_content`, `cta`).
- **Required fields** — the minimum the block needs to render.
- **Optional fields** — present-or-absent content (eyebrow/corner, button,
  media). The template renders nothing when they are empty.
- **Variant selector** — an explicit choice mapped to a `data-*` attribute. The
  default variant is the common case.

## Field → token rules

- Every selectable value (heading size, spacing, color role) is a token choice,
  generated from the token layer (reuse `inc/token-fields.php`). Never a free
  text or a hardcoded value.
- Heading fields offer H1–H6 and nothing else; the block maps the level to the
  corresponding token size.
- Media fields offer the media plus its position when the block has more than one
  position variant.

## Example

| Block | Layout | Required | Optional | Variant |
|---|---|---|---|---|
| hero | `hero` | heading, media | button, eyebrow | `primary` (bg image) / `secondary` (image right) |
| text | `text` | heading | eyebrow, rich text, button | `split` when beside media |
| media_content | `media_content` | media, rich text | heading, button | media position left/right |
| cta | `cta` | heading | rich text, button | — |

## Exit

Every matrix row in `components.md` names its layout, its required and optional
fields, and its variant. A block without this row is not ready to build.
