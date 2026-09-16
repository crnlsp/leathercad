# Free text labels (slice 4.11b) — design

**Date:** 2026-09-16
**Status:** Accepted with the [Phase 4 reconciliation](2026-09-15-phase-4-reconciliation-design.md)
**Decisions:** [ADR 0011](../../adr/0011-one-vendored-typeface-outlined-on-paper.md)
**Invariants delivered:** X5 and X6 for labels; S10 for text size; format version 5

---

## What this adds

The half of 4.11 that persists something: a label the user types, positioned on a part, printed on
the template. "Fold before stitching", "glue here", a maker's mark.

4.11a built the typesetting; this gives it something of the user's own to set.

## Acceptance criteria

1. The **Text** tool places a label on the selected part, at the point clicked, and selects it.
2. The property panel edits its words and its size in millimetres. Typing changes what the canvas
   shows at once.
3. A label moves with the select tool, turns with the rotate tool, and grows evenly with the scale
   tool. Stretching it along one axis is **refused with a reason** — letters do not stretch.
4. Labels print: they are in the exported PDF as filled outlines, like every other string.
5. A label survives save and reload, at format version 5. Files from versions 1 to 4 still open.
6. Placing a label with no part selected changes nothing and says why.
7. A character the typeface cannot print draws its box and is reported, naming the label.

## The model

```ts
interface TextLabel extends Omit<FeatureBase, 'source'> {
  kind: 'text-label';
  source: TextSource;                 // narrowed: a label has text, and nothing else does
}

type TextSource = {
  kind: 'text';
  text: string;
  at: Vec2;                           // the baseline's left end, before rotation
  sizeMm: Mm;                         // cap-to-baseline is the typeface's business; this is the em
  rotationRad: number;
};
```

**The words live in `source`, not on the feature.** `domain-model.md` §3.8 sketched `text`, `at`,
`sizeMm` and `rotationRad` as fields of the feature, but that sketch predates `GeometrySource` — and
the codebase has already been here once. The `HardwareHole` comment records the same decision and
the reason for it: a feature whose position is not in `source` is the one feature that
`transformFeatures`, `translateFeatures`, hit-testing, rendering and the mirror each need a special
case for. As a source, a label inherits all of them, exactly as a hardware hole inherits them by
being a circle.

It also puts a label on the right side of the oldest invariant here: **the file stores parameters
and evaluation recomputes geometry**. A label's geometry is its glyph outlines, generated from the
string, the size and the typeface — never stored, and improved for every existing file whenever the
typesetting improves.

The type narrowing runs both ways: `FeatureBase.source` stays `GeometrySource`, which has no text
variant, and `TextLabel` overrides it with `TextSource`. So a cut contour cannot hold text and a
label cannot hold a path, and the compiler — not a reviewer — is what enforces it. The loader's
schema mirrors the same narrowing.

## Evaluation

A resolved label carries its layout, and its `path` is the box the text occupies:

```ts
{ ok: true; feature; role: 'annotation'; path: Path; text?: PlacedText }
```

- `text` is the laid-out, rotated placement. The canvas draws the typeface at those positions; the
  exporters fill the same glyphs as outlines. One layout, as 4.11a established.
- `path` is the rotated box around the run. Selection, hit-testing, bounds and fit-to-view all work
  on it without knowing what text is, which is the same trick the hole set plays with the line its
  holes sit on.

## Rotation belongs in typography

`placeText` gains `rotationRad`: glyph positions turn about the anchor, and each glyph's outline
turns about its own position. It is a few lines there and it is where the knowledge belongs —
4.10's aligned dimensions need exactly the same thing, and a second implementation of it in the
domain would be the beginning of two answers.

## Transforms, through parameters

A label transforms the way a parametric shape does (§4.2 rule 1, invariant X9):

| Transform | What happens |
|---|---|
| Move | `at` moves |
| Rotate | `rotationRad` accumulates, `at` turns about the pivot |
| Scale evenly | `sizeMm` and `at` scale |
| Scale unevenly | **Refused**, `TEXT_WOULD_DISTORT` — letters would stretch |
| Flatten to nothing | Refused, `TRANSFORM_FLATTENS`, as everything else is |

## Format version 5

`text-label`, with its `text` source. The `v4_to_v5` migration is an identity — no version 4
document contains a label — and `fixtures/format/v5.lcp` holds one, so the chain is proved by a real
file as rule 3 of `file-format.md` §4.2 requires.

## Diagnostics

No new channel, and one new code:

- `TEXT_GLYPH_MISSING` now also covers a label's own words, naming the label rather than the part.
  Its facts gain an optional feature subject; the part-name case is unchanged.
- `TEXT_WOULD_DISTORT` (X9) for a non-uniform scale.
- `NO_TARGET_PART` and `TARGET_SPANS_PARTS` gain a `what` fact, so the same code can say "a label"
  where it used to say only "a fold or marking line". The existing wording for lines is unchanged.

## Interaction

- **A tool, keyed X.** Click on the selected part's canvas to place "Text" there and select it;
  the panel is where the words are typed. T is taken by Rotate ("turn"), and a label is placed once
  rather than dragged out.
- **A label belongs to a part**, like a fold or marking line: features live in parts, and a label
  floating outside one would have nowhere to be. With no part selected, nothing happens and the
  status bar says why.

## Deliberately not here

- **Text on a path, multi-line labels, alignment handles.** One line, one anchor.
- **A second weight or italics.** ADR 0011 vendored one face.
- **Generated text** — measurement values and part captions. Those are X6: generated from the
  model, never typed, and they are 4.10 and 4.11a respectively.
