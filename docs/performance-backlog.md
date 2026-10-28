# Performance audit and implementation backlog

**Recorded:** 2026-10-25 · **Audited commit:** [`5cf7294`](https://github.com/crnlsp/leathercad/tree/5cf7294)
· **Release assignment:** 1.6, all of it (2026-10-28), under [Roadmap → Performance](roadmap.md#performance).

This is the durable record of the repository-wide performance audit and the work it recommends.
It records findings, not completed fixes. Start with the task register, then use each task's
evidence, implementation checklist and acceptance criteria to scope an independent PR.

## Scope and revision boundary

The audit inspected the desktop main/preload/renderer, shared packages, documentation, benchmarks,
persistence, geometry, rendering and export paths. It used the production renderer in unpackaged
Electron, bundled-source computation measurements and the existing performance commands.

**The measurements belong to the audited commit, not automatically to today's `develop`.** This
backlog was added on top of `7f6cc6c`. Between those commits, guides/alignment, update discovery,
the local application protocol, icons, a zoom-state fix and dependency updates landed. In
particular, Electron moved beyond the measured version, snapping gained guide interactions, and
the regeneration test changed its warmup/sampling. Reproduce a finding on the implementation
branch before changing code. Guides/alignment and update discovery were not runtime-profiled by
the original audit; do not describe them as absent from current LeatherCAD.

Code locations below name files and functions; ranges describe the **audited revision** and can
move. Consult that commit for historical line numbers. Original temporary profiles and harnesses
are not committed, so the tables are a historical measurement record, not a portable raw-data
archive. Future implementation PRs must retain their reproducible harness/results as described
under [Verification](#verification-and-evidence).

## How to use this backlog

- The register is the single source of task status: **☐ planned**, **◐ in progress**, **✅ done**.
  Checkboxes inside tasks track acceptance work, not release assignment.
- **P1:** demonstrated high-impact problems to address first. **P2:** meaningful follow-up or
  enabling work. **P3:** low-impact retention or unusual-workload scaling.
- Severity describes impact; confidence describes evidence. **Confirmed** means measured or
  directly reproduced at the audited revision. **Strong evidence** means the mechanism was
  established in code but its full user impact was not measured.
- Small/Medium effort and regression risk are relative estimates, not delivery dates.
- Before starting, mark the row ◐ and link the implementation PR in its tracking cell. When done,
  mark it ✅, complete its acceptance checklist, and link before/after evidence and the merged PR.
  If a finding no longer reproduces, record the tested revision and evidence instead of silently
  deleting it. Split large tasks into linked PRs while preserving the original PERF ID.
- A task enters a release only through an explicit roadmap change. P1 does not silently make it
  part of 1.6's release gate. Link promoted items here rather than duplicating their full scope.

All work preserves [CLAUDE.md](../CLAUDE.md): millimetres, deterministic results, existing
epsilons, command-only mutations, parameter-only persistence, immutable shipped migrations and
exact vector output at 1:1. Geometry/domain changes require property tests. No implicit geometry
simplification, reduced precision, scaled-to-fit output or reduced undo depth as a shortcut.

## Task register

| Status | ID | Priority | Severity | Area / task | Confidence | Effort | Risk | Tracking |
|---|---|---|---|---|---|---|---|---|
| ✅ | [PERF-001](#perf-001) | P1 | High | Share export geometry across history revisions | Confirmed | Medium | Medium | `perf/001-shared-export-geometry` |
| ◐ | [PERF-002](#perf-002) | P1 | High | Reduce tiled PDF duplication and blocking | Confirmed | Medium | High | `perf/002-tiled-pdf`: culling done; blocking remains |
| ✅ | [PERF-003](#perf-003) | P1 | High | Cull Sheets pages and separate interaction decoration | Confirmed | Medium | Medium | `perf/003-sheets-culling` |
| ☐ | [PERF-004](#perf-004) | P1 | High | Avoid full snap-index rebuilds during complex edits | Confirmed | Medium | High | Unassigned |
| ☐ | [PERF-005](#perf-005) | P2 | Medium | Reuse geometry diagnostics for unaffected inputs | Confirmed | Medium | High | Unassigned |
| ☐ | [PERF-006](#perf-006) | P2 | Medium | Reduce self-intersection candidate pairs | Confirmed | Medium | High | Unassigned |
| ☐ | [PERF-007](#perf-007) | P2 | Medium | Isolate pointer-driven React updates | Confirmed | Medium | Medium | Unassigned |
| ☐ | [PERF-008](#perf-008) | P2 | Medium | Reuse Design content and cull off-screen geometry | Confirmed | Medium | Medium | Unassigned |
| ☐ | [PERF-009](#perf-009) | P2 | Medium | Keep persistence work off the interaction path | Confirmed | Medium | High | Unassigned |
| ☐ | [PERF-010](#perf-010) | P2 | Medium | Release previous-project view/tool caches | Confirmed | Small | Low | Unassigned |
| ☐ | [PERF-011](#perf-011) | P2 | Medium | Resize backing stores on DPI-only changes | Confirmed in emulation | Small | Medium | Unassigned |
| ☐ | [PERF-012](#perf-012) | P2 | Medium | Preflight excessive allocation/work requests | Strong evidence | Medium | Medium | Unassigned |
| ☐ | [PERF-013](#perf-013) | P2 | Medium | Bound thumbnail work and cancel obsolete PDF loading | Strong evidence | Medium | Medium | Unassigned |
| ☐ | [PERF-014](#perf-014) | P2 | Low | Schedule canvas frames only when needed | Confirmed | Small | Medium | Unassigned |
| ☐ | [PERF-015](#perf-015) | P3 | Low | Avoid repeated deep dependency walks | Confirmed on stress fixture | Medium | High | Unassigned |
| ☐ | [PERF-016](#perf-016) | P3 | Low | Prune obsolete collapsed-part IDs | Strong evidence | Small | Low | Unassigned |
| ◐ | [PERF-017](#perf-017) | P2 | Medium | Make benchmarks representative and interpretable | Confirmed | Small | Low | Unassigned |

## Recommended implementation order

The first three user-impact priorities are **PERF-001, PERF-002 and PERF-004**. PERF-003 belongs
alongside PDF work. PERF-017 comes first as a short verification prerequisite, not because its
direct impact exceeds those problems.

| Order | Task(s) | Independent PR scope and dependencies |
|---|---|---|
| 1 | PERF-017 | Repair benchmark discovery/reporting; retain historical baselines |
| 2 | PERF-001 | Share heavy derived geometry without changing history semantics |
| 3 | PERF-010, then PERF-016 | Separate small lifecycle-cleanup PRs; coordinate PERF-010 with roadmap Q39 |
| 4 | PERF-002 | Reduce repeated PDF content; preserve clipping and 1:1 fidelity |
| 5 | PERF-003 | Page culling, then content/halo separation; may reuse safe bounds helpers from PERF-002 |
| 6 | PERF-004 | Incremental snap candidates and broad rejection; include current guide behavior |
| 7 | PERF-006 | Exact intersection broad phase; can be pulled forward as a prerequisite to PERF-004 |
| 8 | PERF-005 | Dependency-aware diagnostics; benefit from geometry work without depending on it |
| 9 | PERF-007, then PERF-008 | Separate React subscriptions from canvas-content caching |
| 10 | PERF-014 and PERF-011 | Independent small rendering-lifecycle fixes; may move earlier |
| 11 | PERF-009 | Async persistence with captured-snapshot and recovery semantics; coordinate Q35/Q36 |
| 12 | PERF-013 | Lazy thumbnails and loading cancellation; complements PERF-002 |
| 13 | PERF-012 | Explicit resource budgets with compatibility and failure handling |
| 14 | PERF-015 | Deep graph scaling after common workflows are healthy |

No framework or renderer replacement is planned. Workers, OffscreenCanvas, WebGL and dependency
changes require a new measured justification; they are not default acceptance criteria.

## Measurement record

### Environment and method

Linux/CachyOS `7.3.0-4-cachyos`, x86-64, Ryzen 5 7600X (6 cores / 12 threads), approximately
30 GiB RAM. Electron 44.7.0, Chromium 152.0.7977.130, Electron Node 24.21, shell Node 22.23.3,
pnpm 11.25.0 and Vitest 5.0.3. Production renderer bundle, unpackaged Electron, no development
server/HMR. Displays: 1920×1080 and 2560×1440, reported DPR 1; initial DPR 2 and DPI-only changes
were additionally exercised through emulation. Accelerated canvas/compositing was enabled.

`pnpm test:perf` passed 5/5; `pnpm bench` and `pnpm bench:compare` completed 8 files / 30 cases;
`pnpm build` passed. Comparison was repeated in isolation. Source and generated benchmarks were
both discovered, and Vitest warned about export-getter overhead; see PERF-017. Baselines were not
rewritten. Historical comparisons do not establish regressions without matching workloads and
environment metadata.

Additional computation tests bundled current source with esbuild, reused
[`workloads.ts`](../packages/domain/src/workloads.ts), and usually used 3 warmups / 20 samples;
snap-index construction used 10 samples. Fresh evaluation/diagnosis includes fixture creation.
These timings are separate from production Electron interaction measurements.

Memory checkpoints used cleanup and explicit GC, with heap, DOM/listener counts, workers and
process RSS considered separately. Callback timing covers JavaScript drawing, not GPU or
presented-frame latency. Editing completion waited for two animation callbacks and therefore is
not a pure event-handler or input-to-display measurement.

### Workloads to reconstruct

- **Wallet:** the shipped sample, 3 parts / 198 stitch holes at the audited revision.
- **Long strap:** `strap(5800)`, 3,028 holes, 33 sheets; also `strap(5800, 20)` for cut-outs.
- **Traced outline:** `tracedOutline(250)`, `(500)` and `(1000)`, 468 holes in these fixtures.
- **Simple bag stress:** duplicate `strap(200)` into 30/40/50 independent parts, remapping all
  IDs and source references, positioned in a non-overlapping eight-column layout. Each part has
  an outline, stitch line and hole set: 3,540 / 4,720 / 5,900 holes respectively. This is a
  synthetic scaling fixture, not a measured user-created bag.
- **Path-heavy stress:** 40 independent `tracedOutline(500)` parts with remapped references;
  roughly 2.36 MB JSON / 479 KB compressed at the audited revision.
- **Deep graph stress:** valid mirror chains of depth 10/100/500; unusual rather than typical.

### Selected results

| Production scenario | Observation |
|---|---|
| Fresh-profile startup, three runs | 361 / 326 / 329 ms to mounted app/version availability; filesystem caches warm |
| Idle, 10 seconds | 1,653 animation callbacks, zero paints, zero long tasks |
| Idle, two minutes | Post-GC heap 17.84 MiB; stable DOM/listener counts; renderer CPU about 0.10–0.17%, GPU process about 0.03–0.04% as reported by Electron |
| Wallet hover / pan-zoom | Paint p95 about 0.5 / 0.4 ms |
| 40-part Design hover / pan-zoom | Paint p95 about 1.0 / 0.9 ms |
| 250 name edits, 40-part project | Heap 24.3 → 223.7 → 818.7 → 823.2 MiB at 0/50/200/250 edits; New returned it to 23.0 MiB |
| 500-point preview + pointer, 3 × 20 steps | p50 36–40 ms, p95 40–54 ms; two runs contained a 51 ms long task |
| 33-sheet navigation, three runs | Paint callback p95 63–65 ms; about 14 long tasks per run |
| 33-page PDF preview, three runs | Ready in 2.64–2.67 s; renderer long tasks 2.57–2.61 s |
| Five 40-part preview cycles | Post-GC heap plateau; stable DOM/listener counts |
| New after large Sheets view | 69.2 MiB retained, falling to 25.3 MiB after replacing view/tool caches |
| Path-heavy save, three runs | 118 / 139 / 103 ms wall time; 114 / 136 / 101 ms renderer long tasks |
| Recovery, shortened test interval | Recovery cycles contained >100 ms renderer blocks |
| Initial DPR 2 / twenty resizes | Correct backing dimensions; no observed long tasks |
| DPR-only 1 → 2 | CSS width 640; backing width stayed 640 instead of 1280 |

The 250-edit production memory sequence was one extended run; repeated bundled-source tests
corroborated the bounded-retention mechanism. Do not present it as many independent production
runs. Thirty undo operations were exercised (about 12 ms median with the two-callback wait);
redo was exercised without a separate distribution. Ten synthetic project-replacement cycles
and actual open/New flows were exercised; these do not constitute an hours-long soak.

Bundled-source medians, milliseconds:

| Workload | Fresh evaluation | Fresh diagnosis | Warm-geometry validation | Snap-index build |
|---|---:|---:|---:|---:|
| Wallet | 0.45 | 0.73 | 0.19 | 0.53 |
| Long strap | 0.92 | 1.84 | 0.60 | 0.02 |
| Strap + 20 slots | 0.88 | 8.36 | 7.15 | 0.15 |
| 250-point outline | 2.96 | 10.10 | 5.23 | 6.42 |
| 500-point outline | 9.48 | 28.61 | 10.52 | 22.43 |
| 1,000-point outline | 35.70 | 91.74 | 21.04 | 88.00 |
| 30 simple parts | 1.54 | 3.53 | 0.84 | 1.90 |
| 40 simple parts | 2.01 | 3.97 | 1.10 | 2.70 |
| 50 simple parts | 2.50 | 5.25 | 1.41 | 5.02 |

Five-run bundled PDF medians: wallet 29 ms / 2 pages / 103 KB; 40 simple parts 268 ms / 14 pages /
940 KB; long strap 3,018 ms / 33 pages / 10.35 MB. Path-heavy persistence medians: save 112 ms,
load 33 ms. Hole count alone does not explain cost: segments, cut-outs, dependency depth,
history depth and tile count matter separately.

**Not measured:** hours-long operation, true cold startup, packaged startup, physical printing,
real mixed-DPI monitor migration, GPU utilization/VRAM/presentation timing, complete native peak
memory, slow/network filesystems and cross-platform behavior. No claim of verified physical
print accuracy follows from this audit.

## Implementation tasks

### PERF-001

**Share export geometry across history revisions.** Memory and recomputation; priority, effort
and risk are in the register.

**Locations:** [`sheets.ts`](../apps/desktop/src/renderer/src/sheets.ts), `sceneFor`, `sheetPlanFor`,
`printStatusFor` (31–100); [`scene.ts`](../packages/export/src/scene.ts), `buildExportScene`
(108–177); [`store.ts`](../packages/document/src/store.ts), history/dispatch (45–106);
[`App.tsx`](../apps/desktop/src/renderer/src/App.tsx), print-status props (887–906).

**Evidence/impact:** Each project identity gets an export scene/plan, including individual hole
paths. Normal chrome requests print status even without opening Sheets. History retains the
WeakMap keys, so name edits retain heavyweight values: 24.3 → 818.7 MiB after 200 edits. This
plateaus near the history limit and clears on New: excessive bounded retention, not an unbounded
leak. It increases memory pressure during ordinary long sessions.

- [x] Reproduce 0/50/200/250 metadata-edit checkpoints on the implementation revision.
  Reproduced at `664d6e6`, worse than the audit's Electron run: about 6.8 MiB a rename (below).
- [x] Share unchanged resolved geometry; separate captions/metadata from heavy paths and bound
  plan retention independently of document history. Include cross-part dependency identities.
  `buildExportScene` keeps a part's *ink* — every path and word but its caption — by its features
  array, reused only while the path, holes and words each feature resolves to are the same
  objects, so a stitch line following another part's outline is redrawn when that outline moves.
  An unchanged part is the same `ExportPart`; pagination turns a part only when placing it so, and
  each list of paths once. `renderer/src/sheets.ts` keeps what it derives only for the project last
  asked about, the one on screen, instead of for every project history holds.
- [x] Verify a substantially lower post-GC plateau, correct captions, full undo/redo and geometry
  invalidation. Record bytes and retained objects before/after; do not reduce history depth.
  `export/src/scene.test.ts`: a rename shares the paths and prints the new name, undoing it prints
  the old one, a cross-part outline change redraws the follower, and a property — any run of
  renames, quantities, resizes, hidden holes and role choices — builds the scene a copy sharing no
  object builds. `renderer/src/sheets.test.ts`: caption and geometry through undo and redo, and a
  retention ceiling (16 MiB over 250 renames). `HISTORY_LIMIT` stays 200.

| PERF-001, 40-part bag, renames 0 / 50 / 200 / 250 | Before (`664d6e6`) | After |
|---|---|---|
| Heap after full GC, over the first checkpoint | 0 / 350 / 1,366 / 1,374 MiB | 0 / −0.8 / −0.3 / 0.0 MiB |
| Heap snapshot nodes | 0.45 M / 11.65 M / 43.99 M / 44.26 M | 0.45 M / 0.41 M / 0.42 M / 0.43 M |
| Plan, print status and evaluation per rename, median of 60 | 11 ms | 1.8 ms |
| The same after undo / redo, median of 30 | 0.0 / 0.0 ms (kept) | 1.4 / 1.4 ms |

Measured with the retention test's workload in `sheets.test.ts` — the audit's bag, forty
`strap(200)` parts in eight columns, each rename followed by what the chrome reads of the revision
(`resolvedFor`, `sheetPlanFor`, `printStatusFor`) — in a Vitest worker on Node 24.22.0, on the
audit's Ryzen 5 7600X with other builds running beside it. Heap bytes are `heapUsed` after two
forced collections, identical to 0.1 MiB over three runs; nodes are the V8 heap snapshot's
`node_count`. The production Electron sequence was not repeated, and other per-project memos —
`diagnose`, for one — were outside this harness.

**Expected benefit:** Avoid much of the measured roughly 4 MiB of retained growth per name edit
in this fixture; exact improvement must be measured. Coordinate with PERF-010.

**Result:** removed: the plateau is the first revision's. An undo now derives the earlier plan
again, about 1.4 ms on this fixture, where it used to be kept. Coordinated with PERF-010: nothing
here outlives the project on screen, so New releases the previous plan at the first render.

### PERF-002

**Reduce tiled PDF duplication and blocking.** PDF/export CPU and responsiveness.

**Location:** [`writer.ts`](../packages/export/src/pdf/writer.ts), `exportPdf`/`drawPage` (83–156).

**Evidence/impact:** The async export function runs a synchronous page loop. Every tile clips
but emits complete part paths. The 33-page strap blocks the renderer for 2.57–2.61 seconds and
produces 10.35 MB; cancellation cannot respond during that section. The `write the PDF`
benchmark's 1,200 mm strap shows the same per tile: 7 sheets, 254 ms and 744 KB, against
12.6 ms for a sheet with nothing placed.

- [x] Reproduce long-task duration and emitted geometry on the long-strap fixture.
  At `664d6e6`: 33 sheets, 3.3–3.4 s with no timer able to run, 10.6 MB, 100,990 strokes (below).
- [x] Conservatively reject off-tile paths, including stroke/overlap allowances, or evaluate
  reusable PDF Form XObjects. Reduce duplicated work before moving it to another thread.
  `export/src/pdf/reach.ts`: on a tiled sheet the writer leaves out a path, or a glyph contour,
  whose box — grown by the widest a stroke reaches at PDF's default miter limit (5 × its width),
  the arc-to-cubic tolerance and 10 mm more for coarse rasterisers — misses the clip. The clip is
  the tile's window, overlap included. Each path's box is measured once. Form XObjects were not
  needed for the pattern and were not tried for the sheet furniture.
- [ ] Yield/cancel between bounded batches if remaining work still blocks interaction.
  **Still blocks**: 0.64 s for the 33 sheets. Profiled, about 60 % of it is pdf-lib's `save()`
  compressing every content stream in one call before it writes, which yielding between pages
  cannot split; the page loop is the rest. Not done here. Recommended next: a worker for the
  whole export, or cancellation with PERF-013, measured in the renderer.
- [x] Compare exact page geometry, tile joins, boundary strokes, captions, registration marks,
  landscape/upright transforms and 1:1 dimensions; record duration and output size.
  Every page of six PDFs rendered by poppler at 8, 30, 96 and 254 dpi is byte-identical before
  and after (the 5.8 m strap; 1.2 m landscape in the print form; 400 × 300 grids with assembly map
  on A4, and in the print form with a 1.012 × 0.991 correction; 700 × 330 Letter landscape print
  form; 900 × 500 A3 landscape — each with stitch holes, a slot, a caption and a label across the
  joins), with the same page count and sizes. The existing PDF tests, poppler measurements
  included, pass. `reach.test.ts` holds the rule as properties: a path whose ink reaches the
  sheet — by its line, or only by its stroke — is never left out.

| PERF-002, A4 portrait, Node 24.22.0 Vitest worker | Before (`664d6e6`) | After |
|---|---|---|
| 5.8 m strap, 33 sheets: export, median of 5 | 3,325 ms | 638 ms |
| Longest stretch no timer could run, median of 5 | 3,324 ms | 637 ms |
| Size | 10.61 MB | 2.16 MB |
| Strokes / fills / curve segments written | 100,990 / 234 / 467,927 | 4,610 / 197 / 79,821 |
| 1.2 m strap, 7 sheets: export / size | 230 ms / 764 KB | 129 ms / 425 KB |
| `write the PDF` bench (1.2 m strap), `bench:compare` mean | 264 ms (baseline 254) | 147 ms |

Measured with the audit's `strap(5800)` and the bench's 1.2 m strap, built from source; the
longest stretch is the largest gap between `setTimeout(0)` callbacks during the export. Same
machine as PERF-001, load under 1 for the benchmark. Not measured: the renderer's own long task
in Electron, and pdf.js's rendering (the comparison used poppler).

**Expected benefit:** Less repeated geometry, shorter blocking and potentially smaller files.
No speedup target is inferred. PERF-003 may share safe bounds helpers, not viewport-dependent output.

### PERF-003

**Cull Sheets pages and separate interaction decoration.** Canvas CPU and allocations.

**Locations:** [`sheetsDisplay.ts`](../packages/export/src/sheetsDisplay.ts), `sheetsView` and piece
construction (168–329); [`CanvasHost.tsx`](../apps/desktop/src/renderer/src/CanvasHost.tsx),
`paintSheets` (553–603).

**Evidence/impact:** All layers/pages are submitted, including off-screen pages. Tile layers
contain repeated transformed geometry; hover/selection invalidates combined layers. Three
33-page navigation runs reached 63–65 ms p95 drawing callbacks, causing visible stutter.

- [x] Cull wholly off-screen pages before drawing, with correct decoration bounds.
  `render/src/extent.ts`: a page's extent is the millimetre box of what it places and, past
  that, the CSS pixels a stroke, a halo or a screen word can reach (a word, one em a
  character, however it is aligned); `reachesView` tests it against the camera, touching
  counting. `sheetsPages` builds each sheet and each taped piece's name as a page,
  `sheetsLayers(pages, view)` draws the pages the camera reaches, whole, as the view always
  drew them: the same items in the same order, every paper under every page's ink, taped
  pieces over (a label can run over another sheet's paper zoomed out, so pages are not drawn
  one at a time). A taped sheet's extent is its clip. `sheetsCulling.test.ts` and
  `extent.test.ts` hold it as properties against the screen transform: a page, stroke, halo
  or word that reaches the canvas by however little is never left out, on a 1x and a 2x display.
- [x] Cache immutable sheet content separately from selection/hover halos. The pages hold
  the paper and ink only and are built once for a plan and its words; a halo is put under
  its piece's ink when the layers are made, for the visible pages only, and kept while it is
  the same, so a pan with the pointer on a piece builds nothing. Pointing at a piece used to
  rebuild every page.
- [x] Avoid complete off-tile geometry duplication while preserving exact content. A taped
  sheet builds its piece, and the halo round it, from the paths and word contours whose box
  can reach its clip, grown by what a stroke or halo reaches *at the smallest zoom* (the most
  millimetres it is ever), via `pathReaches`, the box test `pdf/reach.ts` is built on. It is
  independent of the camera, so nothing is rebuilt when the camera moves. For the audit's
  strap that is most of 3,028 holes on each of 32 sheets. `sheetsTiles.test.ts` holds that
  what it leaves out is out of reach at every zoom from 1 % to 10 000 %, for a stroke and a
  halo.
- [x] Measure zoomed-out and close-up pan/hover/selection; compare sheet content with the PDF
  plan and verify tile boundaries and hit testing. See below. The view is drawn from the plan
  the PDF is written from, unchanged; hit testing is `pieceAt` on the layout, not on what is
  drawn, and `e2e/sheets.spec.ts` pans a sheet into view and finds its piece under the pointer.

| PERF-003, 33 A4 sheets, 1600 × 1000 window | Before (`a9a2201`) | After |
|---|---|---|
| Hover across the strap, fitted (3 %): drawing callback p50 / p95 | 103 ms / 205-221 ms | 17 ms / 21 ms |
| Pan, fitted (3 %): p50 / p95 | 99-102 ms / 103-105 ms | 16.5 ms / 17 ms |
| Hover, about 30 %: p50 / p95 | 96-100 ms / 111-186 ms | 2.4 ms / 2.7 ms |
| Pan, about 30 %: p50 / p95 | 53-55 ms / 54-57 ms | 2.2 ms / 2.5 ms |
| Hover, about 114 %: p50 / p95 | 108-112 ms / 185-223 ms | 1.0 ms / 1.1 ms |
| Pan, about 114 %: p50 / p95 | 54-56 ms / 56-58 ms | 0.8 ms / 0.9 ms |
| Long tasks (over 50 ms) | one for every painted callback: 12-61 a scenario | none |

Measured with `node tools/perf-sheets.mjs time` on the production build in unpackaged
Electron (`fixtures/perf/strap-5800.lcp`: `strap(5800)`, 3,028 holes, 33 sheets), three runs
of each, the ranges above. The audit's machine (Ryzen 5 7600X, Linux 7.3.0-4-cachyos),
Electron 45.0.0 where the audit's was 44.7.0, so the before column is measured again here, and
a load average of about 2 from other work on the machine. A
drawing callback is timed when it painted, so it is the JavaScript that draws, not raster or
presentation time. Hover is a zigzag over the canvas; pan is 60 pointer steps of the sheets. Before: the
commit this branch started from, built in a worktree of its own. The audit's 63-65 ms is a
different run of the same thing. Each step's share, measured while it was built (the hover
rows are p50 / p95): page culling takes the 30 % and 114 % pans from 54 to 13 and 6 ms, and the
fitted pan, where every page is in view, not at all; separating the halos takes the hovers
from 99 / 189 and 114 / 200 ms to 22 / 23 and 9 / 10 ms; leaving out what a clip hides takes
the fitted pan and hover from 103 to 18 and 19 ms, and the rest to 1-4 ms.

Nothing changed on screen. The Playwright visual suite is unchanged, and
`node tools/perf-sheets.mjs pixels` (a fingerprint of the canvas at 143 cameras: every step
of pans along the sheets at three zooms, each with a piece hovered and selected where one
was under the pointer) gives the same fingerprints before and after: 143 of 143 in one run
of each, and in two more runs of the branch the first frame, which one run had caught before
the typeface loaded (the script now waits for it). The same comparison with an earlier
version of the script, on 635 fingerprints over four projects (this strap, the same with 20
slots, a 1.6 m strap, the print test) and a smaller window, against a build with the page
culling and the clip's leaving-out switched off, is the same. Before the last step, which
leaves out what a clip hides, `sheetsView`'s items were also compared item for item with the
previous code's, on three scenes, three papers and every selected and hovered combination.

**Not done / not verified.** The fitted view, where all 33 sheets are in view, still takes
about 17 ms a frame: the 33 verification strips' glyphs, and each sheet's outline and the
holes near it. Drawing each sheet once to a bitmap would take it lower, but a bitmap is
camera-dependent and is not exact at every zoom; not tried. GPU raster and presentation,
other platforms and other displays were not measured, and neither was a 2x display
(the properties cover it, not a run).

**Expected benefit:** Work follows visible pages/relevant paths. Start with page culling as an
independent PR; build on PERF-002 geometry helpers only where appropriate.

### PERF-004

**Avoid full snap-index rebuilds during complex edits.** Algorithms and interaction latency.

**Locations:** [`snap.ts`](../packages/editor/src/snap.ts), `buildSnapIndex` (77–125);
[`tool.ts`](../packages/editor/src/tool.ts), `snapIndex` (384–390);
[`intersect.ts`](../packages/geometry/src/ops/intersect.ts), `intersectPaths` (60–79).

**Evidence/impact:** Every feature pair is considered, with nested segment-pair scans. Project
identity invalidates the index during previews. Builds cost 6.42/22.43/88.00 ms for 250/500/1,000
points. Warm ordinary snap queries were cheap; rebuilding is the main demonstrated problem.

- [ ] Reproduce complex-outline drag/preview behavior, including guides added since the audit.
- [ ] Add conservative path/segment broad rejection and cache unaffected pair results by path
  identity; update changed dependencies rather than rebuilding all candidates.
- [ ] If coalescing preview input, always apply the final input exactly.
- [ ] Verify snap priorities, deterministic ties, exclusions, pixel-derived pick tolerance,
  lines/arcs/curves, guide crossings and cross-part changes; report p50/p95 and long tasks.

**Expected benefit:** Remove repeated whole-document intersection work. PERF-006 can supply an
exact broad-phase primitive; do not make snapping depend on lossy approximations.

### PERF-005

**Reuse geometry diagnostics for unaffected inputs.** Validation CPU.

**Locations:** [`diagnose.ts`](../packages/domain/src/diagnose.ts), `diagnose` (18–44);
[`validate.ts`](../packages/domain/src/validate.ts), validation/off-material rules (89–135,
268–334); [`material.ts`](../packages/domain/src/material.ts), containment/distance (40–64).

**Evidence/impact:** Diagnosis caches by whole project identity. Metadata edits repeat warm
geometry validation: about 10.52 ms for a 500-point outline, or 7.15 ms for a strap with 20 slots
versus 0.60 ms without slots. Hole-to-material/edge work multiplies with cut-outs.

- [ ] Separate metadata-sensitive/global rules from geometry-dependent rules.
- [ ] Cache by resolved material and dependency identities; invalidate affected dependents,
  including cross-part mirrors, rather than simply caching by part ID.
- [ ] Compare complete diagnostics after metadata/local edits, visibility changes, cut-outs,
  undo/redo and cross-part changes; prove unrelated geometry checks are reused.

**Expected benefit:** Avoid unchanged validation work without stale warnings. Preserve one
authoritative diagnostics list; property tests precede domain changes.

### PERF-006

**Reduce self-intersection candidate pairs.** Geometry CPU.

**Locations:** [`intersect.ts`](../packages/geometry/src/ops/intersect.ts), `selfIntersections`
(89–108); [`offset.ts`](../packages/geometry/src/ops/offset.ts), offset validation (172–186);
[`validate.ts`](../packages/domain/src/validate.ts), crossing cache (390–397).

**Evidence/impact:** Every nonadjacent segment pair reaches intersection testing. Fresh evaluation
grew 2.96 → 9.48 → 35.70 ms for 250/500/1,000-point outlines; CPU samples implicated
self-intersection/line-intersection work. Complex traces regenerate slowly despite modest holes.

- [ ] Add conservative bounding/spatial candidate rejection while keeping exact pair tests.
- [ ] Differential/property-test against existing results for closure, adjacency, tangencies,
  overlapping segments, tiny edges, arcs/curves and epsilon boundaries.
- [ ] Report scaling and correctness on both separated and crossing-heavy geometry.

**Expected benefit:** Fewer unnecessary pair tests; no promise of subquadratic worst-case output.
Coordinate shared primitives with PERF-004 and preserve the path-identity crossing cache.

### PERF-007

**Isolate pointer-driven React updates.** React/chrome CPU.

**Locations:** [`App.tsx`](../apps/desktop/src/renderer/src/App.tsx), status update (549) and
diagnostic-derived UI (685–692); [`CanvasHost.tsx`](../apps/desktop/src/renderer/src/CanvasHost.tsx),
status/pointer effects (747–757, 953–967); [`PartsList.tsx`](../apps/desktop/src/renderer/src/PartsList.tsx),
tree/hole calculations (137–182).

**Evidence/impact:** Pointer status updates App and reconcile broad chrome. Production hover
samples included substantial React/tree work despite unchanged documents. This wastes CPU; the
tested wallet remained responsive. Sampling is not an exact React commit-count measurement.

- [ ] Profile cursor-only moves and identify panels with unchanged inputs.
- [ ] Localize cursor consumers; use narrow subscriptions, stable props and memoized derived
  panel data where justified. Keep imperative canvas ownership.
- [ ] Confirm unrelated panels no longer update; verify selection, properties, diagnostics,
  accessibility announcements and keyboard behavior.

**Expected benefit:** Less chrome work on frequent pointer input; no invented timing target.

### PERF-008

**Reuse Design content and cull off-screen geometry.** Canvas rendering/recomputation.

**Location:** [`CanvasHost.tsx`](../apps/desktop/src/renderer/src/CanvasHost.tsx), `paint` (606–678)
and pointer invalidation (953–967).

**Evidence/impact:** Every pointer move invalidates full content along with rulers/overlays;
there is no geometry viewport culling. Sixty moves produced sixty full paints, but p95 was only
about 0.5 ms on the wallet and 1 ms on 40 simple parts. This is scaling headroom, not a demonstrated
small-document raster crisis.

- [ ] Separate content-derived data from transient overlay/ruler invalidation.
- [ ] Add conservative viewport rejection where measurement supports it, including labels,
  screen-constant strokes and handles.
- [ ] Compare full/partial views at extreme zoom and boundaries; verify no stale overlay and
  record work avoided on dense off-screen documents.

**Expected benefit:** Lower hover cost and improved off-screen scaling. Coordinate invalidation
with PERF-014; do not introduce a renderer rewrite.

### PERF-009

**Keep persistence work off the interaction path.** Serialization/compression and I/O lifecycle.

**Locations:** [`lcp.ts`](../packages/persist/src/lcp.ts), save/load/stable serialization (49–141,
225–246); [`useProjectFile.ts`](../apps/desktop/src/renderer/src/useProjectFile.ts), save/open
(165–219); [`useRecovery.ts`](../apps/desktop/src/renderer/src/useRecovery.ts), timer/copy (84–112).

**Evidence/impact:** Filesystem I/O is async, but JSON/ZIP/schema/migration work blocks the
renderer. Forty 500-point parts produced 101–136 ms save long tasks; recovery uses the same
preparation. Bundled load was about 33 ms. Save-on-close shares this critical path.

- [ ] Define captured-snapshot, dirty-state and cancellation semantics before changing execution.
- [ ] Use an asynchronous persistence boundary for expensive pure work; keep one in-flight
  recovery and coalesce queued work to the latest required snapshot.
- [ ] Verify edits during saving, failed writes, recovery, close/open, migrations and deterministic
  serialization; preserve parameter-only files and previous-file safety.

**Expected benefit:** Lower renderer blocking; total CPU work may remain similar. Coordinate
roadmap Q35 (durability) and Q36 (saving a live preview) without silently resolving those policies.

### PERF-010

**Release previous-project view/tool caches.** Memory lifecycle.

**Locations:** [`CanvasHost.tsx`](../apps/desktop/src/renderer/src/CanvasHost.tsx), `sheetsCacheRef`
(205–225, 569–589); [`tool.ts`](../packages/editor/src/tool.ts), cached snap index (384–390).

**Evidence/impact:** Last-use refs survive document replacement until the view/tool is used
again. After New from a large Sheets project, heap was 69.2 MiB; replacing caches reduced it to
25.3 MiB, with no PDF worker at either checkpoint. This retains the last project, not every one.

- [ ] Clear document-lifetime geometry caches explicitly on New/open/reset.
- [ ] Repeat actual open/New cycles, inspect retaining paths and verify prompt post-GC release.
- [ ] Preserve intra-document reuse, intended camera state and tool cancellation; coordinate Q39
  (unfinished tools on open) so cleanup has one lifecycle boundary.

**Expected benefit:** Release the demonstrated roughly 44 MiB of stale state in this scenario.

### PERF-011

**Resize backing stores on DPI-only changes.** Display quality and canvas allocations.

**Locations:** [`CanvasHost.tsx`](../apps/desktop/src/renderer/src/CanvasHost.tsx), resize effect
(692–745); [`PrintPreview.tsx`](../apps/desktop/src/renderer/src/PrintPreview.tsx), `PageCanvas`
(437–455).

**Evidence/impact:** DPR is read when resize runs. DPR 1 → 2 with unchanged CSS width 640 left
backing width 640, not 1280. Initial DPR 2 and real resize worked. Physical monitor migration was
not tested; reverse transitions could retain oversized buffers.

- [ ] Observe resolution changes explicitly and re-arm the observer/listener as needed.
- [ ] Update backing dimensions only when changed; invalidate preview DPR as well.
- [ ] Test emulated and physical mixed-DPI transitions, pointer alignment, rulers and zoom;
  confirm underlying millimetre geometry is unchanged.

**Expected benefit:** Correct sharpness and backing allocation on display-scale transitions.

### PERF-012

**Preflight excessive allocation/work requests.** Stability and memory risk.

**Locations:** [`schema.ts`](../packages/persist/src/schema.ts), numeric/collection constraints;
[`lcp.ts`](../packages/persist/src/lcp.ts), ZIP loading (88–141);
[`stitch.ts`](../packages/domain/src/stitch.ts), distribution (91–127);
[`distribute.ts`](../packages/geometry/src/ops/distribute.ts), count loop (103–106);
[`paginate.ts`](../packages/export/src/paginate.ts), tile allocation (441–499).

**Evidence/impact:** Aggregate holes/pages/vertices/decompressed bytes are not budgeted before
large allocation. A valid 100,000 × 100,000 mm outline with 0.5 mm pitch loaded and implies about
800,000 holes. It was deliberately not evaluated or paginated; OOM was not demonstrated.

- [ ] Define justified aggregate work/expanded-byte limits at trust boundaries before allocation.
- [ ] Provide typed refusals or explicit large-operation handling, never silent omission,
  simplification or scaled output; evaluate compatibility with existing valid files.
- [ ] Test oversized valid and compressed inputs without exhausting the test machine; verify
  ordinary large projects still work and failure preserves the previous document.

**Expected benefit:** Predictable, recoverable failures instead of resource-exhaustion risk.

### PERF-013

**Bound thumbnail work and cancel obsolete PDF loading.** Preview resources/lifecycle.

**Locations:** [`PrintPreview.tsx`](../apps/desktop/src/renderer/src/PrintPreview.tsx), generation
effect, thumbnails and `PageCanvas` (100–124, 213–246, 437–455);
[`pdfPages.ts`](../apps/desktop/src/renderer/src/pdfPages.ts), `openPdf`/`drawPage` (22–61).

**Evidence/impact:** Every thumbnail mounts eagerly: 33 pages produced 35 canvases including the
main preview and app canvas. Loading exposes a promise without an immediate cancellation handle;
obsolete generation can still proceed into PDF opening. Normal destruction exists, and repeated
previews plateaued; this is not proof of a permanent worker leak.

- [ ] Render visible/near-visible thumbnails with bounded concurrency.
- [ ] Retain the loading task immediately, check cancellation between stages and destroy on
  dismissal, obsolete plans and failure.
- [ ] Exercise rapid open/close, paper changes and injected failures; verify eventual worker
  cleanup and stable post-GC memory over repeated cycles.

**Expected benefit:** Less off-screen work and faster cleanup. Complements PERF-002; lazy
thumbnails alone do not fix synchronous PDF generation.

### PERF-014

**Schedule canvas frames only when needed.** Idle CPU.

**Location:** [`CanvasHost.tsx`](../apps/desktop/src/renderer/src/CanvasHost.tsx), animation effect
(680–690).

**Evidence/impact:** Dirty flags stop painting but the callback always schedules another:
1,653 callbacks / 10 idle seconds, zero paints. Measured CPU was small; battery savings were not
measured.

- [ ] Schedule at most one pending callback from invalidation, stopping when clean.
- [ ] Preserve immediate first/resize painting and cleanup on unmount.
- [ ] Verify idle scheduling stops and every store, tool, pointer, view and resize change still
  paints; coordinate PERF-008 rather than maintaining competing dirty mechanisms.

**Expected benefit:** Eliminate unnecessary idle callback traffic without claiming a battery gain.

### PERF-015

**Avoid repeated deep dependency walks.** Graph/evaluation scaling.

**Locations:** [`evaluate.ts`](../packages/domain/src/evaluate.ts), `evaluate`/`resolveFeature`
(161–175, 219–241); [`graph.ts`](../packages/domain/src/graph.ts), graph/cycle checks (161–215,
336–358); [`featureTree.ts`](../packages/domain/src/featureTree.ts), tree/cycle construction (33–75).

**Evidence/impact:** Dependency traversal precedes cache hits and repeats shared ancestry; graph
and tree cycle checks repeat walks too. Valid mirror chains at depth 10/100/500 took
0.026/0.582/14.387 ms warm evaluation. Depth 500 graph/tree work was 8.65/6.06 ms. These depths are
artificial stress, not a demonstrated normal bag workflow.

- [ ] Add per-evaluation resolved-node reuse and shared traversal state where justified.
- [ ] Property-test branching/shared/cross-part dependencies, cycles and per-feature error
  attribution; compare shallow and deep timings without changing geometry results.

**Expected benefit:** Remove repeated ancestry work; keep below common-workflow fixes in priority.

### PERF-016

**Prune obsolete collapsed-part IDs.** Small UI-state retention.

**Location:** [`PartsList.tsx`](../apps/desktop/src/renderer/src/PartsList.tsx), `closed` state and
`setOpen` (114–128, 184–189).

**Evidence/impact:** Collapsing adds IDs; explicit reopening removes them. Deleted/replaced
projects can leave obsolete IDs while the component stays mounted. This is small string
retention, not the measured large cache growth.

- [ ] Prune against live part IDs or reset at the appropriate document boundary.
- [ ] Exercise collapse/delete/open cycles and preserve intended expansion behavior on ordinary
  edits and undo/redo.

**Expected benefit:** Bound this state to relevant parts; may follow PERF-010 lifecycle work.

### PERF-017

**Make benchmarks representative and interpretable.** Verification infrastructure.

**Locations:** [`vitest.config.ts`](../vitest.config.ts), workspace discovery; package Vitest
configs; [`perf.test.ts`](../packages/domain/src/perf.test.ts), validation-ratio test (63–79).

**Evidence/impact:** Generated `dist` and source benches both run, doubling 15 distinct cases to
30. Vitest warns of module-export getter overhead. A lower timing bound requires validation to
take more than half evaluation time, so an improvement could fail. Historical baselines lack
matching environment/workload provenance. The later regeneration warmup change does not address
these remaining issues.

- [x] Restrict benchmark discovery to intended source cases, including when build output exists.
  Per-package `benchmark.include`, guarded by `apps/desktop/src/bench-discovery.test.ts`: 30 cases back to 15. The
  export-getter warning is Vitest module-runner overhead, not a config fault; left visible and
  documented in `docs/testing.md`.
- [ ] Add production-representative bundled timing where needed; distinguish it from Vitest
  timings and record commit, workload, runtime, hardware and sample method.
- [x] Replace minimum-slowness assertions with meaningful upper budgets/behavior verification.
- [x] Coordinate roadmap Q40: measure shipping SVG/DXF writers rather than only render SVG.
  `export.bench.ts` reaches `exportSvg` and `exportDxf` through the package's index. Under
  `bench:compare` (2026-10-26) the shipped SVG writer took 2.11 ms against `svg.json`'s 0.375 ms,
  which had timed the render backend's `renderToSvgString`: a different function, not a
  regression. `svg.json` was re-recorded and `dxf.json` added (2.61 ms), on the machine that holds
  the others, Node 24.22.0, at 80afa43, load about 2. The other three export cases compared level
  and were kept.
- [ ] Preserve existing baselines; version deliberate replacements with their environment.
  Done for two: `export/bench/pdf.json` and `display-list.json` were 13–14× and 6–8× under
  `bench:compare` (2026-10-26) because their workloads had changed since 68c2709, not their code.
  The 1,200 mm strap did not fit A4 then, so it was reported oversized and the PDF placed nothing;
  tiling (7.2a) now prints it across 7 sheets, 744 KB — the old furniture-only sheet takes 12.6 ms
  on today's code, under its 19 ms baseline, and the rest is PERF-002. `git bisect` puts the
  display list at F.7 (8fd1503, a slit per hole: the 13→87 µs recorded in the roadmap), with U.2's
  caption on top. Both were re-recorded on the machine that holds the others, Node 22.23.3, at
  199cb50. The other 13 were kept; all but `diagnose-strap-slots` (1.4–1.6×, not yet examined)
  compare level.
- [ ] Reconcile performance claims in architecture/testing docs with actual implementation:
  canvas layers/culling, cache identities, hole primitives and operation process ownership.

**Expected benefit:** Trustworthy optimization decisions and no duplicate benchmark execution.
Do not turn noisy shared-runner timing into strict sub-millisecond CI gates.

## Verification and evidence

For every implementation PR, record the PERF ID, tested commit/build/runtime, fixture parameters,
sample/warmup counts, before/after results, correctness checks and known limitations. Keep a
reusable workload/harness in the existing test infrastructure; attach raw profiles/logs as CI or
PR artifacts when suitable. Remove private paths, hostnames and other personal data. Do not
depend on an untracked temporary script as the only reproduction.

**Reliable CI checks:** exact geometry/output properties, deterministic work bounds where part
of the behavior contract, correct invalidation, bounded retention, eventual cancellation,
off-screen rejection, idle scheduling, DPR dimensions, preflight refusal and benchmark discovery.
Use generous runtime ceilings where needed. Retain existing geometry golden/property tests,
format fixtures and export/print checks; never update a baseline simply to hide a regression.

**Controlled-machine trends:** p50/p95 interactions, long tasks, post-GC heap, RSS/peak memory,
CPU, startup, PDF duration and save/recovery duration. Extend current workloads with 30/40/50
parts, 250/500/1,000-point traces, many cut-outs, many diagnostics, 200+ history entries and many
sheets. Separate fresh evaluation, warm reuse, rendering and end-to-end interaction timing.

### Remaining profiling checklist

- [ ] Two-hour production/packaged soak: edit, undo/redo, save, switch views, preview and open/New;
  sample process memory and compare post-cleanup retaining paths at fixed cycle counts.
- [ ] Physical mixed-DPI monitor transitions without CSS resizing; check backing sizes, pointers,
  rulers and preview canvases.
- [ ] Cold and warm packaged startup on supported platforms, with OS cache state documented.
- [ ] Chromium rendering/compositor traces for many-page panning; separate CPU submission,
  rasterization and actual presentation rather than treating callback time as frame time.
- [ ] Slow-storage save/recovery while editing; verify latest-snapshot handling and failures.
- [ ] Large-diagnostic selection/tree scenarios, rapid interactions, redo-only timing and
  guide/alignment workloads added after the original audit.
- [ ] Physical tiled/landscape prints at Actual Size, including calibration and overlap joins;
  record measurements in [print-verification-log.md](print-verification-log.md).

## Protections to preserve

The audit found fast ordinary Design rendering, batched stitch-hole drawing, useful overview
detail handling, effective feature-identity geometry caching and path-based crossing caching.
Dirty flags prevented idle paints. History is bounded and structurally shared; New released the
large history allocation. Repeated preview heap/listener counts plateaued. Subscriptions,
ResizeObserver and rendering effects have cleanup; PDF page rendering has abort handling.

Main-process filesystem operations are asynchronous and use temporary-file replacement (the
separate durability issue is Q35). Recovery checks dirty/transaction state and serializes main
operations. Printer commands have timeouts; IPC is operation-driven, not per frame. Normal
Electron processes/memory are not a defect. The shared sheet plan and exact vector export are
fidelity protections, not mechanisms to replace for speed.

There is no evidence here requiring a framework/language/GPU-renderer rewrite. Startup dependency
splitting, tree virtualization and broader shared spatial indexes remain optional investments
until a current workload demonstrates a need.
