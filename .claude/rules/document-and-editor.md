---
paths:
  - 'packages/document/**'
  - 'packages/editor/**'
---

# Commands, tools and the editor

The flow is one-way: a tool reads input and dispatches a command; the command makes a new
document; the store keeps it and its history. See `docs/architecture.md` §4.

- **A command is a pure description.** `apply` takes a document and returns a new one, with no side
  effect and no hand-written inverse — undo is a snapshot, correct by construction. Anything a
  command needs is captured when it is built, not read from somewhere at `apply` time.
- **One user action, one undo step.** A drag is a gesture — the store's `begin`, `preview` on each
  move, then `commit` or `rollback` — so its previews never enter history. A new kind of action
  gets a `HistoryAction` id; the words for it live in the app (ADR 0018).
- **Build on the existing commands.** A new edit is usually a composition of the ones in
  `commands.ts`. Write a new primitive only when nothing composes to it.
- **Tools never touch the store.** A tool reads the document and the viewport and dispatches. Its
  own state — what is being dragged, the hover — stays in the tool, never in the document.
- **Millimetres in, millimetres out.** Pointer input becomes millimetres in `viewport.ts`, once.
  Hit and snap tolerances are screen-constant: a pick radius in pixels, converted to `toleranceMm`
  through the viewport, never a fixed millimetre value that is useless at another zoom.
- **Keep a frame cheap.** A pointer event marks a layer dirty, and the one `requestAnimationFrame`
  loop draws it. Nothing draws from an event handler. A drag repaints the overlay; the content
  layer redraws only when the document or the viewport changes (`docs/architecture.md` §6.2).
- **Previews re-evaluate only what changed.** A gesture's `preview` makes a new document, and
  evaluation reuses every feature that is still the same object. So a command replaces only what
  it edits. It never clones or rebuilds the whole document, which would re-evaluate all of it on
  every pointer move.
- **Measure before optimising.** Profile the drag, then speed up what is actually slow
  (`docs/architecture.md` §8). A speed-up keeps a benchmark (`pnpm bench`) or a `perf.test` budget
  so it cannot quietly regress.
- **Test the interaction without a canvas** (`docs/testing.md` §5.3): drive the tool with
  synthetic events and assert on the commands it dispatches and the document that results.
