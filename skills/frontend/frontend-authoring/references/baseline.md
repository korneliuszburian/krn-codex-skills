# Baseline and progressive structure

## Mechanism

Start from the host's semantic landmarks, readable real content, source order,
and native controls. Where an essential action or content depends on
enhancement, retain the smallest meaningful baseline and name its failure
posture before adding optional behavior.

## Decision condition

Use this when a brief introduces media, disclosure, loading, or interaction
that could hide the essential view before the browser enhances it.

## Baseline posture

Record essential content and primary action; their semantic/source-order path;
what remains usable with enhancement removed; the capability-dependent addition;
and the named product-owned alternative when no meaningful fallback exists.
Remove the enhancement once to test this posture before relying on it.

## Limitations

This does not choose product copy, accessibility policy, or application data
contracts; use the host's existing owners for those decisions.

## Falsifier

Remove the enhancement or optional media: if essential content, reading order,
or the primary action disappears without an explicit product-owned alternative,
the baseline is insufficient.

## Provenance

Local mechanism labels: CV-01, PS-01, PS-09. Primary sources:
[HTML sections](https://html.spec.whatwg.org/multipage/sections.html) and WAI's
[APG introduction](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/),
plus Andy Bell's [progressive-enhancement article](https://piccalil.li/blog/its-about-time-i-tried-to-explain-what-progressive-enhancement-actually-is/).

## Target-owner handoff

Hand data shape, loading policy, authorization, and cross-view behavior to the
application or product owner; retain only the rendered-view seam.
