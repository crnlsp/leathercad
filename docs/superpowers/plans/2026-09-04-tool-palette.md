# Tool Palette and Window Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the tool palette out of the header into a grouped left rail, give undo/redo their own place, and reserve a per-tool options strip — so that the six tools Phase 3 still adds land in a structure that has room for them.

**Architecture:** Three scopes get three homes. Document actions stay in the header; modes move to a left rail grouped by create/modify; the active tool's settings get a dedicated strip. The tool registry becomes shared data rather than a literal inside `App.tsx`, so the rail and the keyboard handler read one list.

**Tech Stack:** React 19 in the Electron renderer, plain CSS (no framework), Playwright for the tests.

## Global Constraints

- Read `docs/superpowers/specs/2026-09-04-tool-palette-design.md` first. It carries the reasoning; this plan carries the steps.
- **`data-testid="tool-select"` and `data-testid="tool-rectangle"` must keep working.** `e2e/shell.spec.ts` drives them at lines 136, 141, 164, 199, 207 and 237. If the E2E suite needs editing to pass, the move has broken something a user would notice.
- No new dependency. There is no renderer unit-test infrastructure (no `.test.tsx` anywhere, no jsdom); adding React Testing Library would be a new dependency and `CLAUDE.md` requires an ADR for those. **Test this slice through Playwright**, which is already set up.
- Millimetres, Y-up, and every other `CLAUDE.md` invariant are untouched by this work — it is chrome only. No file under `packages/` changes.
- `pnpm check` must pass before each commit. Run it, report the real output.
- Prettier runs on save via the project hook; `pnpm format` before committing if unsure.

---

### Task 1: Extract the tool registry

Moves the tool list out of `App.tsx` so the rail, the keyboard handler and `CanvasHost` read one source. No visual change — this task is green when the app looks identical.

**Files:**
- Create: `apps/desktop/src/renderer/src/tools.ts`
- Modify: `apps/desktop/src/renderer/src/App.tsx:12-17` (delete the `TOOLS` literal), and its `TOOLS.map` at :98 and keyboard handler at :69
- Test: `e2e/shell.spec.ts` (existing, unchanged)

**Interfaces:**
- Produces: `ToolGroup = { id: string; label: string | null; tools: readonly ToolEntry[] }`, `ToolEntry = { id: string; label: string; key: string }`, `TOOL_GROUPS: readonly ToolGroup[]`, and `ALL_TOOLS: readonly ToolEntry[]` (flattened, for the keyboard handler).

- [ ] **Step 1: Create the registry**

```ts
// apps/desktop/src/renderer/src/tools.ts
export interface ToolEntry {
  readonly id: string;
  readonly label: string;
  /** Single-letter shortcut, shown on the button. */
  readonly key: string;
}

export interface ToolGroup {
  /** Null for the ungrouped lead entry — Select stands on its own. */
  readonly label: string | null;
  readonly tools: readonly ToolEntry[];
}

/**
 * Modes, grouped by what the user is doing: making something, or changing
 * something that exists. That is the CAD convention — Line, Circle, Arc and
 * Polyline together under drawing, modification separate — and it is why
 * rectangle does not sit apart from polyline despite being parametric. The
 * parametric difference is met in the property panel, not here.
 *
 * Only modes belong in this list. Undo, save and delete are actions: they fire
 * once, and a palette that mixes the two teaches nothing about either.
 *
 * Groups with no tools yet are not rendered. An empty heading is noise.
 */
export const TOOL_GROUPS: readonly ToolGroup[] = [
  { label: null, tools: [{ id: 'select', label: 'Select', key: 'V' }] },
  {
    label: 'Draw',
    tools: [
      { id: 'rectangle', label: 'Rectangle', key: 'R' },
      { id: 'line', label: 'Line', key: 'L' },
      { id: 'polyline', label: 'Polyline', key: 'P' },
    ],
  },
  // Filled by slices 3.6 (circle, arc), 3.7 (move, rotate, scale) and 3.9
  // (vertex). Reserved keys: C, A, M, T, S, N, G.
  { label: 'Modify', tools: [] },
];

export const ALL_TOOLS: readonly ToolEntry[] = TOOL_GROUPS.flatMap((g) => g.tools);
```

- [ ] **Step 2: Point App.tsx at it**

Delete the `TOOLS` constant at `App.tsx:12-17`. Add to the imports:

```ts
import { ALL_TOOLS, TOOL_GROUPS } from './tools.js';
```

Replace `TOOLS.map(` with `ALL_TOOLS.map(` in the header's tool `<div className="toolbar">`, and `TOOLS.find` with `ALL_TOOLS.find` in the keyboard handler near `App.tsx:69`.

- [ ] **Step 3: Verify nothing moved yet**

```bash
pnpm check && pnpm test:e2e
```

Expected: both pass, unchanged. The app still renders one flat tool row in the header.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/tools.ts apps/desktop/src/renderer/src/App.tsx
git commit -m "refactor(desktop): extract the tool registry, grouped"
```

---

### Task 2: The left rail

**Files:**
- Create: `apps/desktop/src/renderer/src/ToolPalette.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx` (remove the tool `<div className="toolbar">` from the header; render `<ToolPalette>` as the first child of `.workspace`, with `<PartsList>` beneath it)
- Modify: `apps/desktop/src/renderer/src/styles.css` (`.workspace` grid at :45-49, new `.rail` rules)
- Test: `e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `TOOL_GROUPS` from Task 1.
- Produces: `<ToolPalette activeId={string} onSelect={(id: string) => void} />`.

- [ ] **Step 1: Write the failing test**

Add to `e2e/shell.spec.ts`:

```ts
test('the tool palette holds modes and nothing else', async () => {
  await withFreshApp(async (window) => {
    const rail = window.getByTestId('tool-rail');
    await expect(rail).toBeVisible();

    // A mode stays on once chosen. An action would not, and an action in a
    // mode palette is the thing this layout exists to prevent.
    await window.getByTestId('tool-line').click();
    await expect(window.getByTestId('tool-line')).toHaveClass(/active/);

    // Undo is an action: it belongs to the document, not the rail.
    await expect(rail.getByTestId('undo')).toHaveCount(0);
    await expect(rail.getByTestId('save')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm test:e2e
```

Expected: FAIL — no element with `data-testid="tool-rail"`.

- [ ] **Step 3: Write the component**

```tsx
// apps/desktop/src/renderer/src/ToolPalette.tsx
import { TOOL_GROUPS } from './tools.js';

/**
 * The mode palette.
 *
 * Modes only. Everything here changes what a click does and stays active until
 * another is chosen; nothing here fires and finishes. See
 * docs/superpowers/specs/2026-09-04-tool-palette-design.md.
 */
export function ToolPalette({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  return (
    <nav className="rail" data-testid="tool-rail" aria-label="Tools">
      {TOOL_GROUPS.filter((group) => group.tools.length > 0).map((group, index) => (
        <div className="rail-group" key={group.label ?? `lead-${index}`}>
          {group.label !== null && <h2 className="rail-heading">{group.label}</h2>}
          {group.tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={tool.id === activeId ? 'tool active' : 'tool'}
              data-testid={`tool-${tool.id}`}
              onClick={() => onSelect(tool.id)}
              title={`${tool.label} (${tool.key})`}
            >
              {tool.label}
              <kbd>{tool.key}</kbd>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Wire it into App.tsx**

Delete the tool `<div className="toolbar">…</div>` block from the header (the one wrapping `ALL_TOOLS.map`). In `.workspace`, put the rail and the parts list in one column:

```tsx
<div className="workspace">
  <div className="left-column">
    <ToolPalette activeId={toolId} onSelect={setToolId} />
    <PartsList
      store={store}
      project={storeState.document.project}
      selected={storeState.selection.features}
    />
  </div>
  <CanvasHost store={store} toolId={toolId} nextId={nextId} onStatus={handleStatus} />
  <PropertyPanel
    store={store}
    project={storeState.document.project}
    selected={storeState.selection.features}
  />
</div>
```

Add the import: `import { ToolPalette } from './ToolPalette.js';`

- [ ] **Step 5: Style it**

In `styles.css`, replace the `.workspace` rule at :45-49 and add:

```css
.workspace {
  display: grid;
  grid-template-columns: 200px 1fr 240px;
  min-height: 0;
}

.left-column {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
  border-right: 1px solid var(--border);
}

.rail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
}

.rail-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rail-group + .rail-group {
  margin-top: 12px;
}

.rail-heading {
  margin: 0 0 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.rail .tool {
  justify-content: space-between;
  width: 100%;
}
```

If `--text-dim` is not defined in `styles.css`, use the colour the existing `.panel h2` rule uses — match, do not invent.

- [ ] **Step 6: Run the tests**

```bash
pnpm check && pnpm test:e2e
```

Expected: PASS, including the six pre-existing `tool-rectangle` / `tool-select` interactions, unchanged.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/src/ToolPalette.tsx apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/src/styles.css e2e/shell.spec.ts
git commit -m "feat(desktop): move the tools into a grouped left rail"
```

---

### Task 3: Give undo and redo their own place

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx:144-165` (the undo/redo `toolbar`)
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Test: `e2e/shell.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('history sits apart from the file actions', async () => {
  await withFreshApp(async (window) => {
    await expect(window.getByTestId('history-group').getByTestId('undo')).toBeVisible();
    await expect(window.getByTestId('history-group').getByTestId('save')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm test:e2e
```

Expected: FAIL — no `data-testid="history-group"`.

- [ ] **Step 3: Order the header and mark the group**

In `App.tsx`, move the undo/redo `<div className="toolbar">` so it comes **before** the file-actions toolbar, and give it the testid and class:

```tsx
<div className="toolbar history" data-testid="history-group">
```

Undo and redo are history, not persistence; they sit left of Open/Save/Export and are separated from them, so the header reads: identity, then history, then file.

- [ ] **Step 4: Separate them visually**

```css
.toolbar.history {
  margin-right: 6px;
  padding-right: 12px;
  border-right: 1px solid var(--border);
}
```

- [ ] **Step 5: Run the tests**

```bash
pnpm check && pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/src/styles.css e2e/shell.spec.ts
git commit -m "feat(desktop): separate history from the file actions"
```

---

### Task 4: Reserve the tool options strip

Empty today, and that is the point: the polyline's angle step, a corner radius for the rectangle tool and iron pitch for stitching tools all arrive soon, and with no home they will leak back into the rail or the header.

**Files:**
- Create: `apps/desktop/src/renderer/src/ToolOptions.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`, `apps/desktop/src/renderer/src/styles.css`
- Test: `e2e/shell.spec.ts`

**Interfaces:**
- Produces: `<ToolOptions toolId={string} />`, rendering nothing when the tool has no options.

- [ ] **Step 1: Write the failing test**

```ts
test('the options strip takes no room until a tool has options', async () => {
  await withFreshApp(async (window) => {
    // No tool has options yet, so the strip must not occupy space. An empty
    // bar above the canvas is exactly the noise this layout removes.
    await expect(window.getByTestId('tool-options')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm test:e2e
```

Expected: PASS trivially — the element does not exist. That is fine: this test's job is to fail *later*, if someone renders an empty strip. Note that in the commit message.

- [ ] **Step 3: Write the component**

```tsx
// apps/desktop/src/renderer/src/ToolOptions.tsx

/**
 * Settings for the active tool, and nothing else.
 *
 * Renders nothing at all when the active tool has no options — an empty strip
 * above the canvas is the noise this layout exists to remove. It is here
 * before it is needed because tool settings are arriving shortly (the
 * polyline's angle step, a corner radius for the rectangle tool, iron pitch
 * for stitching), and without a designated home they end up in the rail.
 */
export function ToolOptions({ toolId }: { toolId: string }): React.JSX.Element | null {
  const options = OPTIONS[toolId];
  if (options === undefined) return null;

  return (
    <div className="tool-options" data-testid="tool-options">
      {options}
    </div>
  );
}

/** Keyed by tool id. Empty until a tool has a setting worth showing. */
const OPTIONS: Record<string, React.JSX.Element | undefined> = {};
```

- [ ] **Step 4: Render it above the canvas**

In `App.tsx`, wrap `CanvasHost` so the strip sits above it:

```tsx
<div className="canvas-column">
  <ToolOptions toolId={toolId} />
  <CanvasHost store={store} toolId={toolId} nextId={nextId} onStatus={handleStatus} />
</div>
```

```css
.canvas-column {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
}

.tool-options {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-raised);
  border-bottom: 1px solid var(--border);
}
```

- [ ] **Step 5: Run the tests**

```bash
pnpm check && pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/ToolOptions.tsx apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/src/styles.css e2e/shell.spec.ts
git commit -m "feat(desktop): reserve a strip for tool options"
```

---

### Task 5: Look at it, and prove the header stopped wrapping

The bar wrapping to two lines is what prompted this. A passing test suite does not show that it stopped.

**Files:**
- Modify: `docs/roadmap.md` (record the slice), `docs/superpowers/specs/2026-09-04-tool-palette-design.md` (status → implemented)

- [ ] **Step 1: Build and drive the app**

```bash
pnpm build
```

Then drive it with a Playwright script that presses each tool key, screenshots at 1280×813 and again at 1024 wide, and saves both. Look at the screenshots. Check: the header is one line at both widths; the rail groups read clearly; Select is visually separate from Draw; the parts list sits under the rail without the two running together.

- [ ] **Step 2: Record the slice in the roadmap**

Add to Phase 3, before 3.6, noting that it was built first so the six tools Phase 3 adds land in a structure with room for them.

- [ ] **Step 3: Run everything**

```bash
pnpm check && pnpm test:e2e
```

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs/
git commit -m "docs: record the tool palette slice"
git push -u origin HEAD
gh pr create --fill
```

Attach both screenshots to the PR description.

---

## Self-review

**Spec coverage.** Modes-vs-actions split → Tasks 1, 2, 3. Three scopes, three homes → Tasks 2, 3, 4. Create/modify grouping → Task 1. Empty groups unrendered → Task 2 Step 3 (`.filter`). Options strip → Task 4. Testids survive → Global Constraints and Task 2 Step 6. Modes stay modes → Task 2 Step 1. No wrapping → Task 5. Icons, flyouts, native menus and align/distribute are out of scope in the spec and appear in no task, correctly.

**Placeholders.** None. Every code step carries the code. The one judgement call — `--text-dim` may not exist — is called out with the rule to follow (match the existing `.panel h2`, do not invent).

**Type consistency.** `ToolEntry` and `ToolGroup` are defined in Task 1 and used in Task 2. `TOOL_GROUPS` and `ALL_TOOLS` are named identically throughout. `ToolPalette` takes `activeId`/`onSelect`; `App.tsx` passes `toolId`/`setToolId`, which match those types.

**One known softness:** Task 4 Step 2's test passes immediately rather than failing first, because it asserts an absence. That is deliberate and flagged in the step — its value is as a regression guard against someone rendering an empty strip later.
