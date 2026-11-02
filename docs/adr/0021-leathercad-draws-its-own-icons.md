# 21. LeatherCAD draws all its own icons

**Status:** Accepted
**Date:** 2026-10-25
**Supersedes:** [0017](0017-lucide-for-generic-icons.md)

## Context

[ADR 0017](0017-lucide-for-generic-icons.md) split the interface's icons in two. The leather marks —
each a specimen of the line it names — and the geometry tools were drawn here; the generic verbs,
some 45 of them, came from Lucide. That replaced emoji, and it worked.

It also made the window's most-seen controls — Settings, Help, the Design and Sheets views, the
eye and lock of every parts row — the same drawings as countless other applications built on
Lucide. The marks gave LeatherCAD a voice of its own; the controls around them did not. The
maintainer asked for a set of the app's own: distinctive, for a leatherworker, and never at the
cost of being understood.

A first round drew leather tools in place of the conventional outlines: a round knife for Design,
an overstitch wheel for Settings, a hang tag for Help, an awl to pin, a struck sheet for *Not
printed*, corners around a rivet for Focus. Read at their real size, several said something else
— an anchor, a sun, a price tag, a key, “no page”, a camera's focus. The second round audited
every icon and redrew the ones that failed. The audit, icon by icon, is
[the icon set's spec](../superpowers/specs/2026-10-25-icon-set.md).

## Decision

**Every icon in the interface is drawn here.** The glyphs live in
`apps/desktop/src/renderer/src/icons/Icon.tsx`, one table keyed by name; the names live in
`icons/names.ts`, so a menu or a table of faces can name an icon without JSX, as `markFor.ts` names
the marks. `<Icon of="settings" />` replaces `<Icon of={Settings} />`. The leather marks and the
geometry tools are unchanged. `lucide-react` is removed.

**The outline says what it is; the detail says whose it is.** Each icon passes four tests:

1. **Job** — what it must say, in a line.
2. **Words** — whether a label always sits beside it, or the icon is the whole control. Alone, it
   must be the shape people already look for.
3. **Others draw** — what Material Symbols and Lucide draw for the same job: the outline people
   have learned.
4. **Read at size** — drawn at its real 8–16 px, it says its job and nothing else.

The LeatherCAD detail sits inside the conventional outline: a rivet for a point (the eye's pupil,
the padlock's keyhole, the gear's hub); slits at the pricking iron's slant, taken from
`NOMINAL_IRON` as the stitch-holes mark takes them (the spinner, the bin's ribs, the spacing
glyphs); one 45° strike for every “off”; a stitched seam; the pattern card's clipped corner; the
steel rule's hanging hole; the fold's dash-dot rhythm for the axis of Flip and Mirror. A dashed
line still means a stitch line. The outline itself is leather only where the thing is leather: the
spacing glyphs and the legend's key of line types.

**One hand.** A 16-unit box, a 1.5 stroke, round caps and joins, the current colour. A stroke
stays 1.5 px at any size (UI Foundations §10.1), as Lucide's `absoluteStrokeWidth` kept it:
`styles.css` sets `vector-effect: non-scaling-stroke` on every `.icon`'s shapes. That also brings
the geometry tools into line in the collapsed rail, where at 20 px their strokes had grown to
1.9 px beside 1.5 px ones.

**Turned to fit** draws the Rotate tool's own icon, so that drawing has one home.

The table also holds the icons the multi-window work (8.12–8.14) needs — pin, unpin, a new
project, a template, open, search, the project menu and *changed on disk* — so that branch swaps to
them when it reaches develop, rather than bringing Lucide back.

## Consequences

- One dependency fewer. Adding an icon is drawing one, against the four tests, not importing one.
- `Icon.test.ts` draws every icon and holds the slits to the iron's slant; `arrange.test.ts` holds
  ↔ to an upright axis and ↕ to a level one for both Flip and Mirror — the first round had the two
  mirrors the wrong way round.
- The pixel references are retaken: every window shows the new set.
- The UI Foundations spec (§10) and the plans that name Lucide describe the app before this
  decision; they are records, and this ADR is the current word.

## Alternatives rejected

- **Keep Lucide.** The controls seen most stay the ones every other app has.
- **Another set** — Phosphor, Tabler, Material Symbols. A dependency again, and as common.
- **Leather tools as the outlines** (the first round). Distinctive, and misread: the audit found
  the outline has to be the conventional one for anything alone in a row or a corner.
