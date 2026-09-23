# 17. Lucide for generic icons; LeatherCAD's own marks drawn here

**Status:** Accepted
**Date:** 2026-09-23

## Context

The interface had no icon system. Visibility and lock were emoji (👁 🚫 🔒 🔓), which render in
whatever colour emoji font the platform has, ignore the text colour, cannot show state by colour,
and differ between machines. The audit counted them as a category-1 defect. The collapsed tool rail
(F.2) showed a shortcut letter where an icon belongs.

UI Foundations §10 splits icons into two tiers. **Tier 1** is the generic verbs: eye, lock, more,
chevron, pointer, type. Nobody needs a bespoke trash can, so these are adopted from an existing set.
**Tier 2** is the LeatherCAD marks: each is a specimen of the geometry it names, in that geometry's
hue, dash ratio and relative weight. No existing set can supply those.

## Decision

**Tier 1 is Lucide, through `lucide-react`**, pinned to an exact version as a development
dependency of `apps/desktop` (Vite bundles it). It is ISC-licensed, has no install script, and
tree-shakes, so only the icons imported ship. It is used at 16 px with an absolute 1.5 px stroke
(`absoluteStrokeWidth`), which is §10.1's stroke at every size.

**The geometry tools and Tier 2 are drawn here**, as SVG in the renderer. The geometry tool icons
(Rectangle, Circle, Arc, Line, Polyline, Rotate, Scale) follow Lucide's visual language: 24 grid,
round caps, stroke in the current colour. Each also shows its **construction nodes**, the drafting
convention that tells *the tool* apart from *a rectangle* (decisions §4.2). The Tier 2 marks read their
colours from the theme's role table, so a mark cannot drift from the line it names.

## Consequences

- Every emoji in the interface is gone. Icon state is shown by colour, as §10.1 requires: rest,
  hover, active and disabled change colour, never shape.
- Marks on the dark shell use each role's **shell value**: the same hue at a lightness that reads on
  dark, as severity already has one value per plane. §3 of the decisions makes hue identity the
  invariant, not the exact value. A test holds each shell value within a few degrees of its canvas
  hue.
- Adding a Lucide icon is an import; nothing else changes. Replacing Lucide would mean swapping one
  small wrapper (`icons/Icon.tsx`) and the imports that use it.
- Supply chain: one pinned package with no dependencies of its own beyond React, and no install
  script. osv-scanner and Dependabot cover it like everything else.
