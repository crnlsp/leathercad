# Tool palette and window chrome — design

Date: 2026-09-04
Status: implemented (slice 3.5a)
Build before: slice 3.6 (circle and arc tools)

## Problem

The header holds four unrelated concerns in one row: the application title, the project-name field,
the tool palette, and file actions (Open, Save, Export PDF) with Undo and Redo. At 1280 px it
already wraps to two lines.

The pressure is not evenly distributed. File actions are essentially complete; the tool row is not.
Phase 3 adds circle and arc (3.6), move, rotate and scale (3.7), vertex editing (3.9) and guides
(3.10) — potentially six more buttons into a row that is already full. Building those slices first
means placing six controls into a cramped bar and then moving all of them again.

## The distinction the design rests on

Two kinds of control are currently indistinguishable, because they share a row and a style:

- **Modes** change what a click does. Exactly one is active and it stays active: Select, Rectangle,
  Line, Polyline, and soon Circle, Arc, Move, Rotate, Scale, Vertex.
- **Actions** fire once and are finished: Open, Save, Export, Undo, Redo, Delete, and later Align
  and Distribute.

A user has to learn by trial which buttons stick. Worse, a palette full of actions advertises them
as modes. The split also bounds the problem, which is the point: **modes are finite here — nine or
ten, ever.** Actions are unbounded, so they must not accumulate in one place. Each goes where its
scope is.

## Three scopes, three homes

| Scope | Home | Holds |
|---|---|---|
| Document | Header | Project name, Undo/Redo, Open/Save/Export |
| Mode | Left rail | Every tool, grouped |
| Selection | Properties panel | Delete, and later Align and Distribute |
| Active tool | Options strip | That tool's settings |

```
┌──────────────────────────────────────────────────────────────┐
│ LeatherCAD  [Untitled        ]     ↶ ↷   Open  Save  Export  │
├──────┬───────────────────────────────────────────────────────┤
│      │ (tool options strip — only the active tool's settings) │
│  ↖ V ├───────────────────────────────────────┬───────────────┤
│      │                                       │ PROPERTIES    │
│ DRAW │                                       │               │
│  □ R │                                       │ selection      │
│  ○ C │              canvas                   │ scope         │
│  ◜ A │                                       │               │
│  ╱ L │                                       │               │
│  ⌇ P │                                       │               │
│      │                                       │               │
│ MODIFY                                       │               │
│  ✥ M │                                       │               │
│      ├───────────────────────────────────────┴───────────────┤
│ PARTS│                                                       │
└──────┴───────────────────────────────────────────────────────┘
```

## Grouping: create, then modify

```
  ↖  Select                   on its own, always first

  DRAW      R  Rectangle
            C  Circle         3.6
            A  Arc            3.6
            L  Line
            P  Polyline

  MODIFY    M  Move           3.7
            T  Rotate         3.7
            S  Scale          3.7
            N  Vertex         3.9

  MEASURE   G  Guides         3.10
```

Only Select, Rectangle, Line and Polyline exist today. **Modify and Measure are not rendered while
empty** — an empty group heading is noise, and the groups appear as their slices land.

An earlier draft of this design split Shapes (rectangle, circle, arc) from Draw (line, polyline),
on the grounds that parametric shapes stay editable as numbers while drawn paths persist as
coordinates. That was rejected after review: it is a seam in *our model*, not in the user's. Nobody
choosing a tool is thinking "I want a parametric primitive". CAD convention groups Line, Circle, Arc
and Polyline together as drawing and separates modification; vector editors likewise put rectangle,
ellipse and pen in one creation region. The parametric distinction is met later, in the properties
panel, where it actually bites and where the application already explains it.

## The tool options strip

A thin strip below the header showing **only the active tool's settings**, and nothing at all when
the tool has none.

It exists now, empty, because the alternative is worse. Tool settings are arriving shortly — the
polyline's angle-snap step, a corner radius for the rectangle tool, iron pitch for stitching tools —
and with no designated home they will leak into the rail or the header and recreate the problem this
design exists to solve. Inkscape's equivalent is described as the most important toolbar in its
interface for exactly this reason.

## What is not being built

- **Icons.** Labels stay text with the keyboard hint. Commissioning an icon set is a separate job,
  and text is more discoverable for the onboarding slice (8.3).
- **Nested flyouts.** Affinity and Illustrator hide tool variants behind dropdowns and long-press,
  which keeps palettes short at the cost of discoverability. Ten modes does not need it. When
  ellipse and polygon tools arrive — their constructors already exist from 1.7 — they nest under
  Rectangle rather than adding rows.
- **Native application menus.** File and Edit menus remain Phase 8: they need main-process `Menu`
  wiring and IPC, which crosses the platform boundary, and menu-only actions are less discoverable
  for a first-time user.
- **Align and distribute.** Slice 3.10 adds them, into the properties panel.

Three groups plus Select is about the ceiling before headings become noise in their own right. The
most heavily grouped of the vector editors is also the one most often called cluttered.

## Testing

- The existing E2E suite drives tools by `data-testid="tool-*"`; those identifiers must survive the
  move, so the suite passes unchanged. If it needs editing to pass, the move has broken something a
  user would notice.
- A test that every mode in the rail is a mode: activating one leaves it active, and no control in
  the rail dispatches a command on click.
- Keyboard shortcuts keep working, and the new letters (C, A, M, T, S, N, G) are reserved but only
  bound when their tool exists.
- The app is launched and looked at, at 1280 px and at a narrow width. The bar wrapping to two lines
  is what prompted this; the result must not wrap.

## Out of scope, recorded so it is not relitigated

Icons, flyouts, native menus, align and distribute, and any change to the properties or parts panels
beyond relocating the parts list beneath the rail.
