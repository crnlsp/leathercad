# The UI/UX audit, and a visual language for LeatherCAD

**Date:** 2026-09-17
**Status:** Proposed — for discussion. Nothing here is implemented.
**Superseded in part (2026-09-18):** §5.1 and §6.1 recommend a second family, IBM Plex Mono, for
numbers. That recommendation was **dropped** after checking the extracted glyph data — Plex Sans
digits are already tabular. See [paper reference and
typography](2026-09-18-paper-reference-and-typography.md) §2.2. The rest of the audit stands.
**Gate:** [roadmap](../../roadmap.md) § *Checkpoint — the UI/UX audit*, between Phase 4 and Phase 5
**Method:** the application was built and driven — twenty-odd screenshots across eight workflows —
not read. Every measurement below is from the running app, not from the CSS.

> **State of the gate.** The checkpoint says *all 4.X merged, then the audit*. PR #42 (4.12) is open
> and 4.13 is not built. The audit is being done now at your instruction; that is fine, and it means
> the app under review is `slice/4.12-validation-complete`, which is the most complete state it has
> ever been in. 4.13's close-out should be re-read against whatever this audit changes.

---

## 1. The finding in one paragraph

LeatherCAD is **information-complete and expression-poor.** Every fact a maker needs is on screen
somewhere. Almost nothing on screen is *shaped* by what it means. Every control is the same 3 px
rectangle in the same 11 px system font; every panel heading is the same letter-spaced grey; every
feature type is a coloured line whose colour was chosen in isolation, and three of those colours
collide with interface colours that mean something else. The single deliberate brand decision in the
stylesheet — `--accent: #c9a227; /* veg-tan */` — is spent entirely on focus rings, and the single
deliberate typographic decision, vendoring IBM Plex Sans, **was never wired up**: the UI runs on
`system-ui` and the vendored face is loaded and unused.

So: does it look like a coherent leathercraft design application, or a generic CAD prototype? A
generic CAD prototype, and **not because it lacks decoration.** It looks generic because its visual
system is arbitrary with respect to its content. The fix is not ornament. It is to make the look
carry the information the product already has.

**The product already has a voice. It does not yet have a face.** That is the frame for everything
below.

---

## 2. What is already good, and must not be lost

This has to come first, because the temptation in a redesign is to sand off the parts that are
working.

**The writing.** It is the best thing in the product and it is genuinely leathercraft-literate:

> *Folded across Fold (valley). Move that fold and this follows it; move Cut-out and this stays its
> mirror. It cannot be dragged on its own.*

> *Select a part first — a fold or marking line belongs to the panel it is drawn on.*

> *A 60 mm edge margin is deeper than this edge can hold.*

> *Stitch line **can be kept as drawn geometry** · Stitch holes **goes with what it follows, unless
> that is kept***

Nobody writes that by accident. **The visual design should be built to match the writing, not the
other way round.**

**The stitch-hole panel.** Iron preset (*KS Blade 3.85 mm*), Pitch, Fit (*Even, whole number*),
Corners (*A hole on each corner*), then Holes **88**, Spacing **3.85 mm**, Runs **19 · 26 · 18 · 26**.
That last row is a maker's number — how the holes divide between the four sides — and no general
vector tool would ever compute it. This is the strongest "this software understands leathercraft"
moment in the app, and it is buried three panels deep in 11 px grey.

**The live dimension while drawing** (`103.3 × 73.3 mm` above the rubber band, `66.3 mm  −90.0°`
while placing a line). Correct CAD instinct, already present.

**Single-letter tool shortcuts**, shown on every button. Keyboard-first, discoverable, right.

**The dependency tree in the parts panel.** The *idea* is right — *Outline ▸ Stitch line ▸ Holes* is
the model made visible. Only its container is wrong.

**Failed features are drawn, not vanished**, and red-dashed. Right instinct, wrong target — see
§3.11.

---

## 3. UX audit — what using it actually surfaced

Each of these came from driving the app, and most would not have come out of reading the code.

### 3.1 Two different drawing interactions, and a header that tells you the wrong one

Rectangle and Circle are **drag**. Line, Polyline and Arc are **click–click**. Hardware, Text and
Measure are **single click**. The header hint says, permanently:

> drag to draw · middle-drag or alt-drag to pan · scroll to zoom · Del removes

I tried to draw a fold line by dragging, exactly as the header told me to. **Nothing happened**, the
feature count stayed at 3, and the tool was left mid-run with a rubber band following my cursor and
no indication that `Enter` finishes it, `Backspace` undoes a point, or `Escape` cancels. There is no
message, because from the tool's point of view nothing went wrong.

This is the single worst first-run problem in the app. It is not a bug in any one tool; it is an
inconsistency plus a lie in the help text.

### 3.2 The canvas jumps when the tool changes

Measured: picking a draw tool shows the **Draw as** strip and the canvas is `840 × 682.5` at
`y = 101`. Switching to Select hides the strip and the canvas becomes `840 × 734.5` at `y = 49`. The
drawing is still correct in millimetres, but **it moves ~26 px on screen** — about 8.7 mm at the
default 4 px/mm — every time you change tools.

Already recorded as a task, and it is worse than it looks: it is order-dependently breaking the
`a dimension reads the drawing` E2E test on `main`, because the measure tool needs a click within
3 mm of a corner and the canvas has moved under it. The fix belongs in the viewport (keep the world
point under the canvas centre fixed across a resize), not in compensation arithmetic.

### 3.3 The parts panel is structurally too small, and then disappears

With one part and six features the panel is **251.5 px tall** and scrolls. Feature names truncate at
about ten characters — *Stitch hol…*, *Cut-out mir…*. Duplicate the part three times (four parts,
twelve features, an ordinary wallet) and you can see roughly **one and a half parts**.

At a window of **860 × 640 the parts panel is not rendered at all.** Only Problems survives in the
left column. The parts tree is the only way to reach a locked or hidden feature — locking removes a
feature from hit-testing entirely — so at that window size a locked feature becomes **unreachable**.
That is a hard failure, not a cosmetic one.

The cause is structural: the tool rail, the parts tree and the problems list are three different
kinds of thing sharing one scrolling column and competing for height. Adding a problem shrinks the
parts tree.

### 3.4 Disabled controls hide the reason — which contradicts the app's own invariant

X1 says *no command fails silently: every refusal has a reason, from the same check that refuses.*
The domain honours it: `mirrorRefusal`, `foldMirrorRefusal`, `allowanceRefusal`, `flipRefusal`,
`lockRefusal` all return a `Problem`. The panel computes them — and then puts the sentence in a
native `title` on a **disabled** element, which is slow, unstyled, invisible to keyboard users,
absent on touch, and unreliable on disabled controls in the first place.

So the app has a whole class of silent refusals it does not think it has. In the screenshots: *Mirror
across fold*, both *Flip* buttons and *Add seam allowance* all sit greyed with no visible reason.

This is the most systemic finding in the audit and the cheapest to fix well: one `ReasonedButton`
that renders the refusal it was given.

### 3.5 Terminology drifts from the model into the panel

| On screen | Problem |
|---|---|
| *Cut line (outer)* as the heading, *Outline* as the name | Two names for one feature, on one screen |
| *Cut line (inner)* / *Cut-out* | Same again |
| *Flip ↔ · Flip ↕ · Mirror ↔ · Mirror ↕* | Four identical buttons, two very different operations, no visible difference |
| *Follows* / *Mirrored from* / *Mirrors* / *⇄* | Four words for one relationship (already banked) |
| *Keep 1 frozen* | "Frozen" is met for the first time in a destructive dialog |
| *Thickness — not set* on a fold | An unexplained field; it is bend allowance and says so nowhere |

A maker says **edge**, **window** or **slot**, **fold**, **stitch line**, **holes**. "Cut line
(inner)" is the model's vocabulary leaking through.

### 3.6 Measured values that mean nothing

The property panel shows **Perimeter** and **Area** for every feature:

- a straight fold line: *Perimeter 63.17 mm · Area 18.95 cm²* — a line has no area;
- a 4 mm rivet hole: *Perimeter 12.57 mm · Area 0.13 cm²*;
- a stitch-hole set: *Perimeter 338.67 mm · Area 69.43 cm²*.

For an open line the number wanted is **Length**. For a hole it is the diameter, which is already
above it. For a hole set it is the count and spacing, which are already above it. Three of these are
noise and one is wrong.

### 3.7 Number fields clip their own units

`Width 103.38|m` — the unit suffix is cut off by the input. Visible in every screenshot with a
four-significant-figure value. Small, constant, and exactly the sort of thing that makes a precision
tool feel imprecise.

### 3.8 The refusal is 700 px from where you are looking

Drawing a fold with nothing selected correctly refuses, with excellent copy — in the **status bar,
at the bottom of the window**, while the user's eyes are on the canvas where their two clicks just
vanished. The message is right; its position is the problem.

### 3.9 Stitch holes are drawn at a screen-constant size

Holes are 2 px-radius dots. At the working zoom (4 px/mm) a 3.85 mm pitch puts a 4 px dot every
15 px, and the stitching reads as **a bright blue dotted border** — the loudest thing on the canvas,
louder than the cut edge. At high zoom each hole is still 4 px while the pitch is 100 px, so they
become specks.

Neither shows a maker what they need. A hole's size is real, and a pricking iron makes a *slanted
slit*, not a round dot. See §7.1.

### 3.10 Derived geometry is invisible as derived

A mirrored counterpart renders **pixel-identical** to a drawn one. The only thing that says
otherwise is a sentence in the property panel and a `⇄` in a truncated tree row. Yet the two behave
completely differently: one can be dragged, the other refuses.

The rule this wants: **you can always tell, on the canvas, whether a line is one you drew or one the
app derived** — because you can do different things to them.

### 3.11 A failed feature is drawn on top of its healthy source

Set the edge margin to 60 mm on a 105 × 75 panel. The stitch line fails. The canvas draws the
failure **at the geometry it was built from** — so the *outline*, which is perfectly fine, turns red
and dashed. The piece that is correct looks broken and the feature that is broken is invisible.

The intent (show where the problem is) is right; drawing the error *as* the source is what is wrong.

### 3.12 Emoji as the icon system

👁 🚫 🔒 🔓 in every tree row. They render differently on every platform, cannot be recoloured,
cannot take a hover or disabled state, and sit at whatever optical weight the system font decides.
With six features you get a wall of twelve near-identical glyphs. This is the loudest "prototype"
signal in the interface.

### 3.13 Smaller things, logged

- **No hover feedback on the canvas at all.** Nothing lights up under the pointer in Select.
- **Anchors only appear in Measure.** They are the app's snapping vocabulary and every other tool
  hides them.
- **Snap shows a glyph and no word.** Drafting is about knowing *what* you caught: "corner · Outline".
- **Duplicate walks parts off the right edge** and the view never follows; at four copies the last is
  off screen.
- **Destructive actions sit beside constructive ones** at equal weight: *Duplicate | Delete* per part,
  and *Add stitch line* directly above *Delete* in the properties panel.
- **The delete dialog has no elevation** — no shadow, barely-darkened backdrop. It reads as pasted on
  rather than in front.
- **`Delete` takes focus** after a mirror operation (visible orange ring on a destructive button).
- **Flip/Mirror are offered on a hardware hole**, where they do nothing meaningful.
- **The status bar leads with the version number**, which is developer-facing.
- **The permanent header hint** is a cheat sheet that never goes away and is truncated mid-word below
  ~900 px.

---

## 4. Visual design audit

Measured from `apps/desktop/src/renderer/src/styles.css` and the render layer, after seeing them on
screen.

| Dimension | What is there | Verdict |
|---|---|---|
| **Typeface** | `@font-face` declares IBM Plex Sans; `body` uses `system-ui`. **Plex is loaded and never applied.** | A bug, and the root of "generic" |
| **Type scale** | 10, 11, 12, 13, 14 px — five sizes inside a 4 px range | Not a scale. No hierarchy, just noise |
| **Headings** | 11 px, 600, `letter-spacing: 0.08em`, uppercase | The single loudest generic-dashboard signal |
| **Numerals** | Proportional figures from the system font | Wrong for an app whose promise is a number |
| **Mono** | `ui-monospace, 'JetBrains Mono'` in two places (`kbd`, ruler) | Half a decision |
| **Radii** | 1, 2, 3, 4, 6 px, untokenised | Five values, no system |
| **Elevation** | **Zero `box-shadow` in the entire stylesheet** | Dialogs and popovers have no plane |
| **Motion** | **Zero `transition` in the entire stylesheet** | The UI feels inert; nothing acknowledges a press |
| **Spacing** | Ad hoc 2/4/6/10/12 px | No rhythm |
| **Chrome palette** | `--bg #1b1d21`, `--bg-raised #22252a`, `--border #32363d`, `--accent #c9a227` | Coherent, and very nearly monochrome |
| **Canvas ground** | `#1b1d21` — **identical to the app background** | No figure/ground: the workbench is not a surface |
| **Grid** | `#23262b` minor, `#2f343b` major on `#1b1d21` | Contrast so low it reads as texture, and at high zoom as moiré |

### The four ambers

| Colour | Means |
|---|---|
| `#c9a227` | `--accent` — focus, active tool |
| `#ffcc44` | selection on the canvas |
| `#e0a93a` | warning |
| `#e0913a` | **hardware holes** |

Four near-identical yellows carrying four unrelated meanings, two of which (selection, hardware) can
appear side by side on the same drawing. A rivet looks selected.

### Roles that collide

`mark` and `annotation` are both `#8b929b`. A marking line and a dimension are the same colour, and
a dimension is *not* part of the piece while a marking line is.

`cut` is one colour for both the **outer edge** and a **cut-out** — two opposite ideas (this is the
boundary of the piece / remove this from inside the piece) rendered identically.

### So: coherent leathercraft application, or generic CAD prototype?

**Generic CAD prototype.** Concretely, because:

1. the typeface is whatever the OS supplies;
2. the type has no hierarchy, only five small sizes;
3. every control is the same rectangle;
4. there is no elevation and no motion, so nothing has a plane or a response;
5. the canvas has the same ground value as the panels, so there is no *workbench*;
6. the geometry palette was chosen role by role rather than as a system, and collides with the UI
   palette in four places;
7. the icons are emoji.

None of those is about lacking a leather motif. Every one is about the visual system carrying no
information.

---

## 5. Product identity — your directions, and where I disagree

You asked me not to simply agree. Here is each idea, honestly.

### 5.1 "Better typography / a deliberate font system"

**Would it help:** more than anything else on your list, and there is a bug to fix first — the
vendored face is not applied.

**Where I disagree:** a "font system" must not mean *more fonts*. The current problem is not too few
typefaces, it is that five sizes inside a 4 px range produce no hierarchy, and that the numbers —
which are the entire product — are set in proportional figures that shift width as they change, so a
column of millimetres visibly jitters while you type.

**What I would do:** **two families, both already justified.**

- **IBM Plex Sans** for the interface. It is already vendored, and it is the face
  `packages/typography` extracts outlines from — so the chrome, the canvas captions and the printed
  PDF would be one voice. That is a *reason*, not a preference, and it is the kind of reason that
  keeps a decision alive five years later.
- **IBM Plex Mono**, tabular figures, for **every number**: coordinates, millimetres, pitch, counts,
  ruler ticks, the cursor readout, the dimension above the rubber band. One superfamily, two roles.

And then the part that actually creates hierarchy: a real scale (§6.1) and **killing the
letter-spaced uppercase headings**.

**Downside I accept:** Plex Sans is a widely used face and will not be "distinctive" on its own.
That is fine — distinctiveness here should come from the *numbers* and the *lines*, not from a
fashionable display face. A leathercraft CAD tool that shouts through its typeface would be wearing
a costume.

**What I would not do:** add a third family, a display face for the wordmark, or a "friendly"
geometric sans. Two families from one superfamily is a system; five faces is a mood board.

### 5.2 "Custom icons instead of emoji"

**Would it help:** removing the emoji, absolutely and urgently. §3.12.

**Where I disagree:** "custom icon set" as the *first* move is the expensive path and mostly buys
nothing. Nobody needs a bespoke trash can.

**What I would do — two tiers, and only the second is identity work:**

- **Tier 1 — adopt one existing stroke set** (Lucide, or Phosphor) for the ~25 generic verbs: eye,
  eye-off, lock, unlock, trash, copy, undo, redo, plus, chevron, alert-triangle, download. Solved
  problems. Drawing them yourself costs weeks and loses consistency.
- **Tier 2 — draw about ten marks that no icon set has**, because they are the operations this
  product is *for*: cut edge, cut-out, stitch line, stitch holes, fold (valley), fold (mountain),
  marking, seam allowance, mirror-across-fold, hardware hole, measurement. Possibly grain direction
  later.

**The rule that makes the set cohere for free:** *the icon is a specimen of the line it names.* The
stitch-line mark uses the same dash pattern and the same blue the canvas draws. The fold mark uses
the same dash-dot. The cut-out mark uses the same inward hatch. Then the icon in the tool rail, the
swatch in the parts tree, the mark in the property header and the geometry on the canvas are
literally the same drawing at four sizes — which is what makes a set feel authored rather than
bought, and it is ten glyphs, not a hundred.

**Downside:** two visual sources need harmonising — same 16 px grid, same 1.5 px stroke, same round
caps. That is a one-page spec, and worth it.

### 5.3 "Stronger visual hierarchy / clearer tool grouping"

**Would it help:** yes, but the real problem is not labelling. It is that three different kinds of
thing share one scrolling column and the parts tree loses (§3.3).

**What I would do:** treat it as **layout architecture**, not styling — §6.5. The tool rail becomes a
fixed icon strip that never scrolls and never competes; Parts gets the full left column; Problems
becomes a collapsible drawer under the canvas. That is a real hierarchy: *what I am doing* → *what I
have made* → *what is wrong* → *the numbers*.

### 5.4 "A more polished canvas / subtle leathercraft and drafting inspiration"

**Would it help:** yes, and this is where I would spend the identity budget.

**My contrarian recommendation, which I want you to push back on if you disagree: make the canvas
light.**

The argument is not aesthetic, it is the product promise. *A line drawn as 100 mm measures 100 mm on
paper.* The export is black on white card. Print verification is a physical measurement against a
printed sheet. A dark canvas with a white cut line previews **nothing** — the screen and the paper
are negatives of each other. A light canvas inside a dark shell would be truthful to the promise,
instantly distinctive against every dark CAD tool on the market, and is the pattern-maker's own
material: manila card, pencil, awl.

**Downsides, honestly:** every role colour has been tuned for a dark ground and would need
re-deriving; long sessions on a bright field are more tiring for some people; and it is more work
than raising the canvas two steps away from the chrome. So it needs to be a **deliberate decision
taken now**, not discovered halfway through Phase 5.

If you would rather not: the minimum is still to give the canvas **its own ground value**, distinct
from the panels, so the workbench is a surface you put things on.

**What I would not do:** a leather texture, a paper-grain overlay, stitched borders, tan gradients.
The moment a leather photograph appears behind the grid the product becomes a theme.

---

## 6. The visual language proposal

### 6.1 Typography

| Token | Size / weight | Face | Used for |
|---|---|---|---|
| `--type-micro` | 11 / 500 | Sans | `kbd`, badges, ruler labels |
| `--type-label` | 12 / 500 | Sans | Field labels, tree rows |
| `--type-body` | 13 / 400 | Sans | Body copy, refusals, problem messages |
| `--type-section` | 13 / 600 | Sans | Section headings — **sentence case, no tracking** |
| `--type-panel` | 15 / 600 | Sans | Panel titles |
| `--type-dialog` | 18 / 600 | Sans | Dialog titles |
| `--type-number` | 13 / 500 | **Mono, tabular** | Every measurement, count and coordinate |
| `--type-number-lg` | 15 / 500 | Mono, tabular | The one number a panel is about |

Rules:

1. **Apply the vendored face.** One line, and it is the difference between "a typeface" and "whatever
   the OS had".
2. **Every number is mono with tabular figures**, including the ruler, the cursor readout and the
   live dimension. Typing in a width field must not make the column breathe.
3. **No uppercase + letter-spacing anywhere.** Replace with sentence case and weight.
4. **Nothing below 11 px**, and field labels move 11 → 12.
5. **Units are part of the number component**, set in the dim colour at a reserved width — which
   fixes §3.7 structurally rather than by widening one input.

### 6.2 Iconography

**Principles.** 16 px box with 1 px keyline padding · 1.5 px stroke · round caps and joins · no fills
except where a fill means *solid/punched* · optical weight matched to 13/600 text · a state changes
colour and never shape.

**States.** rest `--text-dim` · hover `--text` · active `--accent` · disabled 40 % opacity **plus a
visible reason** (§6.6).

**Tier 1 — adopted.** ~25 generic verbs from one stroke set.

**Tier 2 — the LeatherCAD vocabulary.** ~10–12 marks, each a specimen of its line:

| Mark | Drawn as |
|---|---|
| Cut edge | solid, the heaviest stroke in the set |
| Cut-out | closed shape with an inward hatch |
| Stitch line | the canvas dash pattern |
| Stitch holes | three slanted slits at the iron's angle |
| Fold — valley | dash-dot with ticks toward the viewer |
| Fold — mountain | dash-dot with ticks away |
| Marking | fine dotted |
| Seam allowance | two parallel lines with the band between them filled |
| Mirror across fold | a shape and its reflection across a dash-dot axis |
| Hardware hole | a ring with a centre cross |
| Measurement | extension lines and arrowheads |

The same mark appears in the tool rail, the parts-tree swatch, the property-panel header, the
problems list and a canvas legend. **One drawing, four sizes.**

### 6.3 Colour — three planes that never borrow from each other

This is the rule that fixes the four ambers.

**Plane 1 — Chrome.** The greys, plus **one accent: veg-tan `#c9a227`**, reserved for *the user's own
current focus*: active tool, focus ring, primary action. Nothing else may use it.

**Plane 2 — Geometry.** What the leather is made of. Re-tuned so nothing collides with chrome or
state:

| Role | Direction |
|---|---|
| Cut edge | brightest, slightly warm — it is the boundary of the piece |
| Cut-out | same hue, **inward hatch**; colour alone must not carry "remove this" |
| Stitch line | blue, **desaturated** from today's `#5aa9ff` so it stops out-shouting the cut |
| Stitch holes | the same blue, drawn true-size and slanted (§7.1) |
| Fold | green, kept, plus direction ticks |
| Marking | grey, kept |
| Hardware | **off the amber family entirely** — violet or teal |
| Measurement | its own value, distinct from marking, set in mono |
| Construction | lowest contrast on the canvas |

**Plane 3 — State.** Selection · hover · error · warning · info.

- **Selection takes the accent exactly.** One amber, not four. If the thing you are looking at is the
  thing you are working on, it should be the same colour as the tool you are working with.
- **Warning moves to a clearly separate ochre**, far enough from the accent to survive being beside
  it.
- **Derived-versus-drawn is a state, not a colour.** Derived geometry keeps its role colour and gains
  a link cue (§7.4), because what it *is* has not changed — only what you may do to it.

### 6.4 Canvas — the workbench

1. **Its own ground.** Light card in a dark shell if we take §5.4; otherwise at least two steps away
   from `--bg`. The canvas must read as a surface.
2. **Three grid tiers with real contrast steps** — 1 mm hairline, 10 mm, 100 mm — and the 1 mm tier
   *drops out* below a zoom threshold instead of drawing moiré.
3. **Rulers** in mono figures, labels on major ticks only, with a **cursor tick that tracks the
   pointer on both rulers** — a drafting affordance that costs almost nothing.
4. **Anchors on hover in every tool**, not only Measure. They are the snapping vocabulary.
5. **Snap feedback gets a word**: glyph plus `corner · Outline`.
6. **Hover state on the canvas**, which today does not exist.
7. **Failed features stop being drawn on top of their source** (§3.11): draw the source normally, put
   a marker with a short leader at the location, and let the red belong to the marker.
8. **Dimensions drawn like drafting**: extension lines, real arrowheads, mono numerals, the number
   breaking the line rather than floating above it.

### 6.5 Panels — a hierarchy that survives a small window

Today: `[ rail + parts + problems ] [ canvas ] [ properties ]`, with the first column fighting
itself. Proposed:

```
┌──┬──────────────────────────────────────┬──────────────┐
│  │  tool options (contextual)           │              │
│  ├──────────────────────────────────────┤              │
│T │                                      │ Properties   │
│o │                                      │              │
│o │            Canvas                    │ [what it is] │
│l │                                      │ [numbers]    │
│s │                                      │ [primary]    │
│  ├──────────────────────────────────────┤              │
│  │  Problems ▲  (drawer, collapsible)   │              │
├──┴──────────────────────────────────────┴──────────────┤
│  status: counts · notice · cursor                      │
└────────────────────────────────────────────────────────┘
   Parts occupies the full left column beside the rail
```

- **Tool rail:** fixed 52 px icon strip, icon + letter, tooltip with name and shortcut. Never scrolls,
  never competes for height, and recovers ~150 px of width.
- **Parts:** the full left column. Per-part *Duplicate/Delete* move into a row overflow so twelve
  features fit instead of six. Names must not truncate at ten characters.
- **Problems:** a collapsible drawer **under the canvas**, full width — where a list of sentences can
  actually be read — with the count badge in the status bar as its handle.
- **Properties:** keeps its column, gains internal hierarchy — a sticky header carrying the feature's
  mark, name and badges; then sections; then exactly one **primary** action, with destructive actions
  moved out of the main stack.
- **Reserve space, do not remove it.** No panel may vanish at a small window size (§3.3).

### 6.6 Components worth standardising

| Component | Why it earns its place |
|---|---|
| `Field` | label + control + unit, one implementation — fixes §3.7 everywhere at once |
| `NumberField` | mono tabular figures, reserved unit width, commit on Enter/blur |
| **`ReasonedButton`** | disabled **and says why**, from the domain's own refusal — fixes §3.4, the highest-value component in the list |
| `Tooltip` | a real one: styled, delayed, keyboard-reachable. Retires `title` |
| `FeatureMark` | the role glyph, identical in tree, header, problems and legend |
| `Badge` | count + severity (exists, 4.12) |
| `Chip` | the segmented control the Draw-as strip wants to be |
| `Panel` / `PanelSection` | one heading treatment, one padding rhythm |
| `Dialog` | with real elevation and a proper scrim |
| `Toolbar` | grouped, with a primary slot so *Export PDF* stops looking like *Open* |

---

## 7. Ten details that would make it feel like leathercraft

Ranked by *usefulness per pixel*. None is decoration.

1. **Stitch holes drawn true-size and slanted.** A pricking iron makes a slanted slit at a known
   blade width, and the slant is part of the craft. True-size slits immediately show crowding at a
   corner — which is exactly what the app already computes as *Runs 19 · 26 · 18 · 26* and shows
   only as text. This is the highest-value single change on the canvas.
2. **Seam allowance rendered as a band, not a second line.** An allowance *is* the material between
   the stitch line and the edge. Filling it makes "the edge is derived from the stitching" visible
   without a sentence — and 4.9's whole argument was that the stitch line is what you specify.
3. **Folds that show which way they fold.** Valley and mountain differ today only by a word in a
   dropdown. Directional ticks on the dash-dot line, and eventually a ghost of what folds over, turn
   a fold from an annotation into a thing that does something.
4. **A visible difference between drawn and derived.** A link cue on derived geometry, so the canvas
   tells you what the property panel currently has to explain in three sentences.
5. **Run boundaries marked at the corners.** The panel already knows where the runs divide. Showing
   it on the drawing is how a maker checks their corners before punching.
6. **The iron on the pattern.** A quiet caption under the part name: `88 holes · 3.85 mm · KS Blade`.
   Makers write that on their pattern cards, and the app already has every term.
7. **A cut list.** Parts with *Cut 1 off*, total area in **dm²** — the unit leather is sold in — so
   the parts panel doubles as the thing you take to the hide.
8. **Grain direction per part.** Leather stretches across the grain; every pattern piece in a real
   workshop carries an arrow. One glyph, and unmistakably leathercraft. (Needs a model field —
   post-1.0.)
9. **Snap feedback that names what it caught.** `corner · Outline`, not an unlabelled glyph.
   Drafting is about knowing what you have hold of.
10. **A legend, not a tutorial.** A small collapsible key on the canvas — cut / stitch / holes / fold
    / marking / measurement, each drawn as the canvas draws it. It teaches the visual language in the
    place the language is used, and it is the same ten marks as the icon set.

---

## 8. Generic CAD versus LeatherCAD

| Area | Current feel | Desired LeatherCAD feel | What should change |
|---|---|---|---|
| **Typeface** | Whatever the OS supplies | One deliberate voice, shared with the printed pattern | Apply the vendored Plex; add Plex Mono for numbers |
| **Numbers** | Proportional, jittering, 11 px | The product. Tabular, steady, readable across a room | Mono tabular figures everywhere a millimetre appears |
| **Headings** | 11 px uppercase, letter-spaced | Quiet sentence case, hierarchy by weight and size | Delete the tracking; introduce a real scale |
| **Icons** | Emoji | A vocabulary of marks that match the lines they name | Lucide for verbs, ~10 custom marks for leather operations |
| **Tools** | A column of text buttons | A rail you learn once and stop reading | Icon rail, fixed, with letter + tooltip |
| **Canvas** | Same grey as the panels | A workbench you put pieces on | Its own ground value — ideally light card in a dark shell |
| **Grid** | Uniform low-contrast mesh, moiré when zoomed | Drafting paper: 1 / 10 / 100 mm, tiers dropping out cleanly | Three tiers with real steps and a zoom threshold |
| **Cut vs cut-out** | Same colour, same weight | Boundary versus removal — opposite ideas, opposite marks | Inward hatch on cut-outs |
| **Stitching** | Bright blue dots, the loudest thing on screen | Slanted slits at true size, quieter than the edge | True-size holes; desaturate the blue |
| **Folds** | A green dashed line | A hinge with a direction | Direction ticks; later, a fold ghost |
| **Derived features** | Identical to drawn ones | Obviously linked, obviously not draggable | A link cue on the geometry itself |
| **Selection** | One of four ambers | The one accent in the product | Selection = accent; hardware leaves the amber family |
| **Refusals** | Excellent copy, 700 px away or hidden in a `title` | Said where the thing happened | Move notices near the gesture; `ReasonedButton` |
| **Failures** | Red drawn over the healthy source | The failure marked, the source left alone | Marker with a leader, not a red overlay |
| **Panels** | Three things fighting for one column; Parts vanishes at 860 px | A fixed hierarchy that never disappears | Rail / Parts / canvas / Problems drawer / Properties |
| **Actions** | Open, Save and Export PDF identical | One primary act per context | A primary slot in the toolbar and the property panel |
| **Elevation & motion** | None at all | Dialogs in front; controls that answer a press | A two-step elevation scale; 120 ms transitions |
| **Terminology** | *Cut line (inner)* | *Cut-out* — the maker's word, once | One glossary, enforced in the UI |

---

## 9. Priorities

### A — Fix before Phase 5

Correctness, accessibility of information, and things that will otherwise be built on top of.

| # | Finding |
|---|---|
| A1 | Canvas jump on tool change — fix in the viewport (§3.2) |
| A2 | Parts panel disappears below ~900 px; feature names truncate at ten characters (§3.3) |
| A3 | Disabled controls hide their refusal — `ReasonedButton` (§3.4) |
| A4 | Perimeter/Area shown for lines, holes and hole sets (§3.6) |
| A5 | Number fields clip their units (§3.7) |
| A6 | Terminology collisions: *Cut line (outer)* vs *Outline*; *Flip* vs *Mirror*; *frozen* (§3.5) |
| A7 | A failed feature drawn over its healthy source (§3.11) |
| A8 | Emoji icons → Tier 1 icon set (§3.12) |
| A9 | Apply the vendored typeface, add tabular figures, install the type scale (§6.1) |
| A10 | Drag vs click–click inconsistency, and a header hint that states the wrong one (§3.1) |
| A11 | Refusal notices shown near the gesture, not only in the status bar (§3.8) |

A9 is listed as "fix" rather than "design" because the typeface is a one-line bug and the scale is
the foundation everything in B sits on.

### B — Decide the design now; implement incrementally

| # | Work |
|---|---|
| B1 | The token system: type scale, spacing rhythm, radii, two-step elevation, one motion duration |
| B2 | Colour re-plan — three planes, the four-amber collision, mark/annotation collision (§6.3) |
| B3 | **Canvas ground decision: light card or dark** (§5.4). Blocks B4 and B2 |
| B4 | Canvas treatment: grid tiers, rulers, anchors on hover, snap wording, hover state (§6.4) |
| B5 | The ten custom marks, and the rule that an icon is a specimen of its line (§6.2) |
| B6 | Panel architecture: icon rail, Parts full height, Problems drawer (§6.5) |
| B7 | Component library (§6.6) |
| B8 | Stitch holes true-size and slanted (§7.1) |
| B9 | Seam allowance as a band; fold direction ticks; derived link cue (§7.2–7.4) |
| B10 | Toolbar hierarchy — one primary action per context |

### C — Post-1.0

Alignment and smart guides · fold preview/ghost · grain direction (needs a model field) · cut list
and hide yield · run-boundary marks · canvas legend · theming and density settings · a command
palette.

**Note on scope:** B is a *design* deliverable — tokens, a palette, a type scale, eleven glyphs, one
layout decision. It is not a rewrite, and Phase 5 features should consume it rather than each
inventing their own styling. That is the whole point of doing it at the gate.

---

## 10. My own opinion

### The five biggest weaknesses

1. **The visual system carries no information.** Everything is the same rectangle in the same small
   grey type, so nothing on screen tells you what kind of thing it is. This is the root cause of
   "generic", and no amount of polish fixes it without a semantic system underneath.
2. **The left column loses its fight**, and at a small window the parts tree — the only route to a
   locked feature — simply is not rendered. A layout that can hide the user's own work is a
   correctness problem wearing a styling costume.
3. **The app breaks its own best rule.** X1 exists so that no refusal is silent, the domain produces
   every reason, and the UI then hides a whole class of them behind a `title` on a disabled button.
4. **The numbers are set like body text** in an application whose entire promise is a number.
5. **The canvas is not a place.** Same ground as the chrome, a grid you cannot read, no hover, and
   stitching that shouts louder than the cut line.

### The five biggest opportunities

1. **The writing is already there.** Design to match the copy and the product becomes coherent in one
   move. Most products have the opposite problem.
2. **The stitch-hole panel is already best-in-class** and nobody can see it. Promoting *88 holes ·
   3.85 mm · Runs 19 · 26 · 18 · 26* — into the canvas, into the part caption — is identity for
   almost free.
3. **True-size slanted stitch holes.** One rendering change that no general vector tool would ever
   make, immediately legible to any leatherworker, and *useful* rather than decorative.
4. **The light canvas.** Truthful to the product promise, instantly distinctive, and it is the
   material the work is actually done on.
5. **Ten custom marks, used in four places each.** A small, finishable piece of work with a large
   identity return — and a rule (*the icon is a specimen of its line*) that keeps it coherent without
   a designer in the loop for every new feature.

### What I would change first

In order, and the first three before anything visual:

1. **`ReasonedButton` and the notice position.** Restores X1 across the UI, and it is small.
2. **The layout architecture** (icon rail, Parts full height, Problems drawer). Everything else sits
   in these containers, so doing it after the styling means doing the styling twice.
3. **The viewport fix for the canvas jump.** It is currently making a test suite red and it makes
   precision feel unreliable.
4. **Typography**: apply Plex, add Plex Mono tabular, install the scale, delete the tracked uppercase.
   Highest visible change per line of code in the entire audit.
5. **The three colour planes**, which unblocks the canvas work.

### What I would explicitly not change

- **The copy.** Not one sentence. It is the product's voice.
- **The refusal *model*.** Move the notice; do not replace the mechanism.
- **The stitch-hole property panel.** Promote it, do not redesign it.
- **The live dimension while drawing.**
- **Single-letter shortcuts**, and their being printed on every button.
- **The dependency tree idea.** Fix its container, keep its concept.
- **Millimetres everywhere, and the 1:1 promise.** Every visual decision should be checked against it
  — which is what recommends the light canvas.

And a few things I would deliberately *not* add: a leather texture, an onboarding tour, a command
palette (nothing is deep enough to need one yet), and per-panel resizing before the layout is right.

### Trends to avoid

Glassmorphism and blur — this app needs crisp hairlines and honest contrast. Purple/blue gradients.
Oversized rounded cards — CAD chrome wants tight geometry, and a 16 px radius on a tool button reads
as a toy. Animated "delight" — a precision tool that bounces is a precision tool you stop trusting.
Low-contrast grey-on-grey minimalism, which is exactly what the app has already drifted into. Emoji.
Dark-by-default *for the artwork* just because editors are dark. AI-assistant chrome of any kind.

### What could become the signature

**The drafted line.**

The same line, drawn once, appearing at every scale: as a 16 px mark in the tool rail, as a swatch in
the parts tree, as a key in the legend, as the geometry on the canvas, and as ink on the printed
pattern. Cut is cut everywhere. A fold is a hinge everywhere. Stitching is slanted slits everywhere.

Paired with **millimetres in tabular mono that never move**, that is a product whose whole surface
says: *this is a drafting instrument for leather, and every mark on it means exactly one thing.*

That is a signature no competitor can copy without building the same model underneath — which is the
only kind worth having.

---

## 11. What I need from you

1. **The canvas ground decision** (§5.4) — light card in a dark shell, or dark with a raised ground.
   It blocks the colour plan and the canvas work.
2. **Typography: confirm two families** (Plex Sans + Plex Mono), or say if you want a distinct display
   face for the wordmark — which I would argue against everywhere else.
3. **Icons: confirm the two tiers** — an adopted set for verbs, ~10 custom marks for leather
   operations — rather than a fully custom set.
4. **The A-list** (§9): agree it, and whether it lands as one "UI foundations" slice or several.
5. **Whether B becomes its own slice before Phase 5 features start**, which is my recommendation: the
   tokens, the palette, the eleven marks and the layout, implemented once, so no Phase 5 feature has
   to invent a style.
