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
| ✅ | [PERF-002](#perf-002) | P1 | High | Reduce tiled PDF duplication and blocking | Confirmed | Medium | High | `perf/002-tiled-pdf` (culling), `perf/002b-pdf-worker` (worker) |
| ✅ | [PERF-003](#perf-003) | P1 | High | Cull Sheets pages and separate interaction decoration | Confirmed | Medium | Medium | `perf/003-sheets-culling` |
| ✅ | [PERF-004](#perf-004) | P1 | High | Avoid full snap-index rebuilds during complex edits | Confirmed | Medium | High | `perf/004-incremental-snap` |
| ✅ | [PERF-005](#perf-005) | P2 | Medium | Reuse geometry diagnostics for unaffected inputs | Confirmed | Medium | High | `perf/005-diagnostics` |
| ✅ | [PERF-006](#perf-006) | P2 | Medium | Reduce self-intersection candidate pairs | Confirmed | Medium | High | `perf/006-self-intersections` |
| ✅ | [PERF-007](#perf-007) | P2 | Medium | Isolate pointer-driven React updates | Confirmed | Medium | Medium | `claude/perf-007-pointer` |
| ☐ | [PERF-008](#perf-008) | P2 | Medium | Reuse Design content and cull off-screen geometry | Confirmed | Medium | Medium | Unassigned |
| ✅ | [PERF-009](#perf-009) | P2 | Medium | Keep persistence work off the interaction path | Confirmed | Medium | High | `perf/009-persistence` |
| ✅ | [PERF-010](#perf-010) | P2 | Medium | Release previous-project view/tool caches | Confirmed | Small | Low | `claude/perf-010-caches-3c2d47` |
| ☐ | [PERF-011](#perf-011) | P2 | Medium | Resize backing stores on DPI-only changes | Confirmed in emulation | Small | Medium | Unassigned |
| ✅ | [PERF-012](#perf-012) | P2 | Medium | Preflight excessive allocation/work requests | Strong evidence | Medium | Medium | `perf/012-resource-preflight` |
| ☐ | [PERF-013](#perf-013) | P2 | Medium | Bound thumbnail work and cancel obsolete PDF loading | Strong evidence | Medium | Medium | Unassigned |
| ☐ | [PERF-014](#perf-014) | P2 | Low | Schedule canvas frames only when needed | Confirmed | Small | Medium | Unassigned |
| ✅ | [PERF-015](#perf-015) | P3 | Low | Avoid repeated deep dependency walks | Confirmed on stress fixture | Medium | High | `perf/015-dependency-walks` |
| ✅ | [PERF-016](#perf-016) | P3 | Low | Prune obsolete collapsed-part IDs | Strong evidence | Small | Low | `claude/perf-016-folds` |
| ✅ | [PERF-017](#perf-017) | P2 | Medium | Make benchmarks representative and interpretable | Confirmed | Small | Low | `perf/017-benchmarks` |

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
- [x] Yield/cancel between bounded batches if remaining work still blocks interaction.
  Yielding could not split pdf-lib's `save()`, 60 % of the 0.64 s, so the whole write moved to a
  dedicated renderer Web Worker (`perf/002b-pdf-worker`; `docs/printing.md` §6.2a): the plan crosses
  by structured clone and the bytes come back transferred. Closing the Print Preview, changing the
  paper or the printer correction, or asking for another *Export PDF* `terminate()`s the writer
  mid-write, and a file for an obsolete plan is never shown or written. A worker that cannot start
  is reported (`file.pdfUnavailable`), writes nothing, and does **not** fall back to the main
  thread: in a packaged app that would hide a packaging fault R6's test exists to find.
  The worker loads from `app://leathercad` under the unchanged CSP (`script-src 'self'` covers
  `worker-src`); there is no packaging change.
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
machine as PERF-001, load under 1 for the benchmark. Not measured there: the renderer's own long
task in Electron, and pdf.js's rendering (the comparison used poppler); the next table is.

| PERF-002b, 5.8 m strap, 33 A4 sheets, built Electron 45 app, 1600 × 1000 | Main thread (`b023c29`) | Worker |
|---|---|---|
| *Export PDF*: largest gap between animation frames, click to file, 3 runs | 564, 510, 516 ms | 6, 17, 6 ms |
| *Export PDF*: click to file written | 939, 884, 882 ms | 930, 925, 925 ms |
| Print Preview: largest frame gap, click to first sheet drawn, 3 runs | 516, 497, 491 ms | 6, 6, 6 ms |
| Print Preview: long tasks (≥ 50 ms) in that time | 517, 504, 497 ms | none |
| Print Preview: click to first sheet drawn | 616, 599, 594 ms | 805, 801, 799 ms |
| File | 2,126,044 bytes | 2,126,044 bytes, byte-identical |

Measured with `node tools/perf-pdf.mjs <label>` on the production build in unpackaged Electron
(`pnpm build` first), the dialogs stubbed, on the machine of the record above; another agent's
test runs shared it, so read the gaps to the nearest ten milliseconds. The window now paints and
answers throughout. The worker costs time to the result, not to the window: about 40 ms to start
and parse its 1.36 MB bundle and to clone the plan in, and the same again for the Print Preview's
first sheet (+200 ms), which in return can be closed or changed while it is written. Bytes: the
app's file (worker, Electron 45) for the print test, the 5.8 m strap and the sample wallet each
equals Node's `exportPdf` of the same project, dated by the file's own creation date, byte for
byte. `pdfJob.test.ts` holds it per workload: the print test in the print form, the strap, a grid
with its assembly map, and a printer correction, each from the plan and from its clone.

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

- [x] Reproduce complex-outline drag/preview behavior, including guides added since the audit.
  Reproduced at `b023c29`: the 500-point piece drag at 37–38 / 42 ms p50 / p95, as the audit's
  36–40 / 40–54, and worse than the audit's build times suggested in Vitest — a full rebuild met
  every segment of the outline against every segment of the stitch line, recomputing a box per
  pair, and the hole set's line, which lies on the stitch line, crossed it at every vertex, each
  crossing checked against all those kept. Dragging a guide rebuilt every feature pair too.
- [x] Add conservative path/segment broad rejection and cache unaffected pair results by path
  identity; update changed dependencies rather than rebuilding all candidates.
  `geometry/src/ops/intersect.ts`: `intersectPaths` computes each segment's box once and sweeps
  the boxes along x, meeting only pairs that pass the box test it always used (`boxesOverlap`,
  EPS_POINT), in the order the nested loop visited them; a crossing is checked against those kept
  in the cells around it. Same pairs, same crossings, same order. `editor/src/snap.ts` keeps each
  pair's crossings, and each guide's crossings of a path, in a `WeakMap` keyed on the path and
  guide objects: evaluation keeps an unchanged feature's path the same object, so an edit
  recomputes the crossings of what it changed — a moved piece, its derived stitch line and holes,
  a feature following it from another part — and reads the rest. The index is otherwise built as
  before.
- [x] If coalescing preview input, always apply the final input exactly. Not coalesced: every
  move is applied and snapped as before.
- [x] Verify snap priorities, deterministic ties, exclusions, pixel-derived pick tolerance,
  lines/arcs/curves, guide crossings and cross-part changes; report p50/p95 and long tasks.
  `snap` itself is unchanged, and so is what it reads: a property in `editor/src/snap.test.ts`
  builds random projects (lines, arcs, cubics, circles, hidden and locked features, stitch lines
  inset from another part's contour, guides), applies random moves, visibility, lock and guide
  edits through the real commands, and after each holds the index — every candidate, in every
  bucket, in order — equal to one built from a copy sharing no object. In
  `geometry/src/ops/intersect.test.ts`, properties hold `intersectPaths` equal to the old nested
  loop over random segment soups, a path against itself included, and never leaving out two
  segments drawn through one point. The existing snap, guide and tool tests pass unchanged.
  Guarded without timings, in `pnpm test`: an outline and its stitch line of 1,000 segments each
  are read 3,000 times, not the nested loop's 1,001,000 (ceiling 20,000), and after a piece is
  carried or a guide dragged the index holds the very crossing points it computed for what the
  edit left alone. Both fail on the code before.

| PERF-004, select-tool drag in Electron, p50 / p95 (long tasks) | Before (`b023c29`) | After |
|---|---|---|
| 250-point outline, carry the piece | 13.5 / 18.1 ms | 11.0–11.2 / 14.2–14.9 ms |
| 250-point outline, drag a guide | 9.7 / 10.6 ms | 5.7–5.8 / 6.7–7.7 ms |
| 500-point outline, carry the piece | 37.0–37.6 / 41.9–42.2 ms | 22.7–25.0 / 29.0–29.7 ms |
| 500-point outline, drag a guide | 25.1–25.2 / 27.2–29.2 ms | 9.1–9.6 / 10.1–10.9 ms |
| 1,000-point outline, carry the piece | 120.2 / 127.4 ms (57, 6.6 s) | 64.0–64.7 / 68.1–72.2 ms (54, 3.5 s) |
| 1,000-point outline, drag a guide | 78.3 / 84.6 ms (60, 4.7 s) | 17.6–18.1 / 19.3–19.8 ms (none) |

| `editor.bench.ts`, one drag move: evaluate and index snaps, mean | Before (`b023c29`) | After |
|---|---:|---:|
| Nudge a vertex, 250-point outline | 67.1 ms | 24.0 ms |
| Nudge a vertex, 500-point outline | 251.4 ms | 81.5 ms |
| Nudge a vertex, 1,000-point outline | 970.2 ms | 301.1 ms |
| Carry a tab beside a 1,000-point outline | 701.7 ms | 6.2 ms |

Measured with `node tools/perf-drag.mjs` on the production build in unpackaged Electron 45.0.0
(`fixtures/perf/traced-<n>.lcp`: `tracedOutline(n)`, 468 holes, a vertical and a diagonal
guide; 1600 × 1000 window, about 115 % zoom), three runs of 20 moves each, one run before and
two after, the ranges above; and with `editor.bench.ts` under `pnpm bench:compare`, Vitest 5.0.5
on Node 24.22.0, against baselines recorded on `b023c29` (re-recorded on the fix afterwards). The
audit's machine, Linux 7.3.0-4-cachyos, load average about 1–2 from other work. A latency runs
from the pointer event to the end of the animation callback that painted it: JavaScript, not GPU
or presentation. The bench runs through Vitest's module runner, slower than a bundle; compare it
only with itself. Same metric, method and machine before and after; `pnpm bench:compare` left
the other packages' cases level.

**Not done / not verified.** What a piece drag still costs is evaluation: the domain bench's
500-point evaluation is 74.5 ms of the 81.5 ms move, the snap index the rest, and the
1,000-point drag still makes long tasks. That is [PERF-006](#perf-006), not done here. Measured on
Linux only; snapping is pure, and CI's Windows and macOS unit jobs run the same properties and
guards. A box test with one EPS_POINT of slack is narrower than `intersectSegments`' own end
tolerance — fast-check found two segments it calls touching across a gap a hair over EPS_POINT
whose boxes miss — so `intersectPaths` leaves such a touch out, as it always did; pinned as an
example, not changed.

**Expected benefit:** Remove repeated whole-document intersection work. PERF-006 can supply an
exact broad-phase primitive; do not make snapping depend on lossy approximations.

**Result:** a guide drag no longer rebuilds any feature pair, and a piece drag recomputes only its
own, through a broad phase that tests the pairs the old loop tested. The 1,000-point guide drag
went from 78 to 18 ms with no long tasks; the piece drag's remaining cost is evaluation.

### PERF-005

**Reuse geometry diagnostics for unaffected inputs.** Validation CPU.

**Locations:** [`diagnose.ts`](../packages/domain/src/diagnose.ts), `diagnose` (18–44);
[`validate.ts`](../packages/domain/src/validate.ts), validation/off-material rules (89–135,
268–334); [`material.ts`](../packages/domain/src/material.ts), containment/distance (40–64).

**Evidence/impact:** Diagnosis caches by whole project identity. Metadata edits repeat warm
geometry validation: about 10.52 ms for a 500-point outline, or 7.15 ms for a strap with 20 slots
versus 0.60 ms without slots. Hole-to-material/edge work multiplies with cut-outs.

- [x] Separate metadata-sensitive/global rules from geometry-dependent rules.
  Reproduced at `a806a1b`: a rename re-validated every part, 7.1 ms for the strap with 20 slots and
  18 ms for the 1,000-point outline. `domain/src/validate.ts` now finds each feature's
  geometry rules — DR2, and those about its own shape and holes — apart from the rules that read a
  name: a part's (`EMPTY_PART`, `PART_HAS_NO_OUTER_CONTOUR`, its name's glyphs) and a label's
  words, which are asked every time.
- [x] Cache by resolved material and dependency identities; invalidate affected dependents,
  including cross-part mirrors, rather than simply caching by part ID.
  A feature's findings are kept, by the feature object, with every object they were found from:
  the path and holes it resolved to, its part, and that part's outline and cut-outs. Evaluation
  keeps an unchanged feature's geometry the same object between revisions, and all of it is
  immutable, so the same objects give the same findings. A moved outline gives its stitch line,
  its holes and whatever follows it from another part new paths, and its part's other features a
  new material; their findings are found again, and nothing else's. The list and its order are as
  before. With it, `domain/src/material.ts` stops measuring a hole against an edge whose box is
  further from it than the nearest edge so far (with `EPS_POINT` to spare for rounding; the first
  edge is always measured), which is bit for bit the same distance. That fixes
  `diagnose-strap-slots`, the regression [PERF-017](#perf-017) found: since 3.9c an arc's
  distance is found through the nearest point on it, and each of 3,028 holes asked it of 20 slots.
- [x] Compare complete diagnostics after metadata/local edits, visibility changes, cut-outs,
  undo/redo and cross-part changes; prove unrelated geometry checks are reused.
  `validate.test.ts`, a property: through any run of renames, quantities and visibility, slots
  moved, added, removed or carried to another part, outlines resized (with a seam in another part
  following one), pitches changed, and undo or redo to any earlier revision, `diagnose` equals
  that of a copy sharing no object. Named cases for what it does not reach: a slot an outline
  shrinks away from, a feature carried to another part, a crossed cut-out carried between two
  parts with no outline. A rename keeps every feature's diagnostics as the same objects.
  `material.test.ts`: `distanceToEdge` equals, by `Object.is`, the old loop over every edge, for
  1,000 materials and points on edges, between them, anywhere. Each identity check the cache makes
  but one fails a test when removed; the one, of the holes, is implied by the path's.

**Expected benefit:** Avoid unchanged validation work without stale warnings. Preserve one
authoritative diagnostics list; property tests precede domain changes.

| PERF-005, bundled (`tools/perf-compute.mjs`), median ms | Before (`a806a1b`) | After |
|---|---:|---:|
| Diagnosis after a rename: wallet, strap, strap + 20 slots | 0.38 / 0.57 / 7.03 | 0.01 / 0.00 / 0.01 |
| The same: 250 / 500 / 1,000-point outline | 4.31 / 8.82 / 16.83 | 0.00 / 0.00 / 0.00 |
| The same: bags of 30 / 40 / 50 parts | 0.78 / 1.02 / 1.35 | 0.07 / 0.07 / 0.09 |
| Fresh diagnosis, strap + 20 slots | 7.89 (7.70–8.32) | 3.93 (3.69–4.97) |
| Fresh diagnosis and evaluation, every other workload | — | level |
| `bench:compare`, `diagnose-strap-slots` (baseline 33.0 ms) | 47.4 / 45.3 | 17.2 / 17.3 |

Measured on the audit's Ryzen 5 7600X, Linux 7.3.0-5-cachyos, Node 24.22.1, with the desktop
and other sessions keeping the load at 2.3–4, so before and after ran turn about: seven runs each
of `perf-compute.mjs`, the median of their medians and their range, 20 samples after 3 warm-ups a
run, and two each of the domain benchmarks. At 20 samples the bags' fresh diagnosis read 6–13 %
slower; at 200 samples after 20 warm-ups, three runs each, it is level — bag-30 1.822 against
1.806 ms, bag-50 3.054 against 3.014, the wallet 0.368 against 0.358, the strap 1.157 against
1.113 — so that was noise. An earlier version did cost the fresh diagnoses 2–5 % at 200 samples,
from taking each edge's box with two lookups and for the first edge too; it takes one, and none
for the first.

**Guards** (`pnpm test`): *measures nothing again for a rename* (`validate.test.ts`): renaming the
part of a drawn 500-point outline with 468 holes read the outline's segments 480,000 times; the
bound is 1,000, and it reads none. *Keeps every feature's findings through a rename*: the same
diagnostic objects. *Measures only the cut-outs near a hole* (`material.test.ts`): the strap's
3,014 holes against its 20 slots read the slots' segments 60,280 times; the bound is a tenth of
a read a hole, and they are read once each for their boxes. All three fail on `a806a1b`'s
`validate.ts` and `material.ts` and pass after.

**Result:** a rename, or an edit to another part, validates no geometry: 17 ms for the
1,000-point outline is none. A strap with cut-outs measures each hole against the edges that can
be nearest, which undoes 3.9c's regression and halves its fresh diagnosis. Not measured: the
panels in the built app; validation is pure, and CI's Windows and macOS unit jobs run the
properties and guards.

### PERF-006

**Reduce self-intersection candidate pairs.** Geometry CPU.

**Locations:** [`intersect.ts`](../packages/geometry/src/ops/intersect.ts), `selfIntersections`
(89–108); [`offset.ts`](../packages/geometry/src/ops/offset.ts), offset validation (172–186);
[`validate.ts`](../packages/domain/src/validate.ts), crossing cache (390–397).

**Evidence/impact:** Every nonadjacent segment pair reaches intersection testing. Fresh evaluation
grew 2.96 → 9.48 → 35.70 ms for 250/500/1,000-point outlines; CPU samples implicated
self-intersection/line-intersection work. Complex traces regenerate slowly despite modest holes.

- [x] Add conservative bounding/spatial candidate rejection while keeping exact pair tests.
  Reproduced at `cba7996`: `selfIntersections` is 20 of the 1,000-point outline's 21.8 ms of
  evaluation (the offset's last check), and validation asks it again of the outline.
  `geometry/src/ops/intersect.ts` grows each segment's box by how far `intersectSegments` can
  report a touch outside it, sweeps the grown boxes along x with PERF-004's `overlappingBoxes`, and
  tests the pairs whose boxes meet, in the order every pair was. The reach: `4√EPS_POINT` — two
  arcs whose crossings are under `√EPS_POINT` apart are reported at the foot between them, which a
  small enough arc does not reach — plus `64 · Number.EPSILON / EPS_ANGLE` of the segment's size
  (rounding, for lines crossed down to `EPS_ANGLE` from parallel), plus, for an arc,
  `1024 · Number.EPSILON` of the path's scale squared over its radius (rounding against a much
  larger segment). Crossings are kept by cell, as `intersectPaths` keeps them, rather than each
  checked against all kept. A path with a coordinate that is not finite, or of fewer than 20
  segments (`EVERY_PAIR_BELOW`), where that is cheaper, tests every pair as before.
- [x] Differential/property-test against existing results for closure, adjacency, tangencies,
  overlapping segments, tiny edges, arcs/curves and epsilon boundaries.
  `intersect.test.ts` holds the old loop as the specification: equal, crossing for crossing and in
  order, on 1,000 random pairs made to touch or just miss (gaps on each tolerance, either side;
  lines a microradian from parallel; circles through a point, tangent or crossing; cubics; up to
  1e5 mm from the origin), and on open and closed soups of every kind with such a pair among them;
  and in named cases — the touch across a gap a hair over `EPS_POINT` a plain box test drops, two
  small arcs touching at a foot neither reaches (which pins `4√EPS_POINT`: with `EPS_POINT` it
  fails), long near-parallel lines ten metres out, a line touching a tiny arc, three segments
  through one point, a {50/17} star, degenerate segments and paths, a NaN and an infinity. The
  tests pad their paths past 20 segments with lines of no length, which touch nothing, so they
  sweep. Every existing intersection, offset, golden and domain test passes unchanged.
- [x] Report scaling and correctness on both separated and crossing-heavy geometry. Below.

**Expected benefit:** Fewer unnecessary pair tests; no promise of subquadratic worst-case output.
Coordinate shared primitives with PERF-004 and preserve the path-identity crossing cache.

PERF-004 left a sweep in `intersect.ts` (`segmentsWithOverlappingBoxes`). It is exact for
`intersectPaths`, which always had that box test, but not yet for `selfIntersections`, which has
none: `intersectSegments` reports touches across gaps slightly wider than the box test's one
EPS_POINT (see `intersect.test.ts`, and arcs' angular tolerance grows with the radius), so a box
test there would drop them. Widen the slack to what `intersectSegments` accepts, and prove it,
before reusing it.

| PERF-006, bundled (`tools/perf-compute.mjs`), median ms | Before (`cba7996`) | After |
|---|---:|---:|
| Fresh evaluation, 250 / 500 / 1,000-point outline | 2.22 / 7.82 / 29.81 | 0.51 / 0.75 / 1.43 |
| Fresh diagnosis, 250 / 500 / 1,000-point outline | 8.24 / 23.70 / 75.54 | 4.99 / 9.76 / 18.57 |
| Wallet, strap, strap + 20 slots, bags of 30 / 40 / 50: every measure | — | level |

| PERF-006, `pnpm bench` (Vitest module runner), mean ms | Before (`cba7996`) | After |
|---|---:|---:|
| `self-traced-1000`: a 1,000-segment ring, no crossings | 260 / 271 / 270 | 1.83 / 1.81 / 1.86 |
| `self-star-1002`: a {1002/7} star, 6,012 crossings | 1,761 / 1,690 / 1,601 | 21.2 / 21.0 / 21.9 |
| `bench:compare`, one drag move on a 250 / 500 / 1,000-point outline | 23.9 / 76.8 / 288.2 (baselines) | 6.0 / 11.0 / 21.6 |
| `bench:compare`, offset a 500-point outline | 73.7 (baseline) | 2.4 |

Measured on the audit's Ryzen 5 7600X, Linux 7.3.0-5-cachyos, Node 24.22.1, with two other
sessions keeping the load at 2–3.5, so before and after were run turn about: five runs each of
`perf-compute.mjs` (the median of the runs' medians, 20 samples after 3 warm-ups each), and three
each of the two new benchmarks, the same file in both checkouts. The drag and offset rows compare
with the baselines PERF-004 and 68c2709 recorded; the other `bench:compare` cases were level or
faster but `diagnose-strap-slots`, PERF-005's, and the rounded strap's offset, 23 µs against 19
(1.11× when PERF-017 compared it, before this change; it takes the unchanged every-pair route). Crossing counts were identical before and after. Under a
rectangle's 4 segments the sweep cost 1.4 µs a call against 0.08 µs for every pair, which put
the bags 6–10 % behind until paths under 20 segments kept the old loop; at 24 segments the sweep
is already ahead (7 against 9 µs).

**Guard:** `intersect.test.ts`, *reads each segment a bounded number of times, not once per pair*:
a 1,000-segment ring's segments are read 997,000 times by the old loop, two for each pair, and
about 3,000 now; the bound is 10,000, a hundredth of the old count. Fails on `cba7996`'s
`intersect.ts` (`expected 997000 to be less than 10000`), passes after.

**Result:** a traced outline's evaluation no longer grows with the square of its points — 1.4 ms
for 1,000 where it was 30 — and a path that crosses itself thousands of times is no longer
quadratic in its crossings. Diagnosis of the 1,000-point outline is 19 ms, the rest validation's
hole-to-edge distances, which PERF-005 looks at.

**Not done / not verified.** The drag in the built app (`tools/perf-drag.mjs`) was not measured
again. Measured on Linux only; geometry is pure, and CI's Windows and macOS jobs run the same
properties and the guard.

### PERF-007

**Isolate pointer-driven React updates.** React/chrome CPU.

**Locations:** [`App.tsx`](../apps/desktop/src/renderer/src/App.tsx), status update (549) and
diagnostic-derived UI (685–692); [`CanvasHost.tsx`](../apps/desktop/src/renderer/src/CanvasHost.tsx),
status/pointer effects (747–757, 953–967); [`PartsList.tsx`](../apps/desktop/src/renderer/src/PartsList.tsx),
tree/hole calculations (137–182).

**Evidence/impact:** Pointer status updates App and reconcile broad chrome. Production hover
samples included substantial React/tree work despite unchanged documents. This wastes CPU; the
tested wallet remained responsive. Sampling is not an exact React commit-count measurement.

- [x] Profile cursor-only moves and identify panels with unchanged inputs.
  Reproduced at `b0ab404` with `node tools/perf-pointer.mjs`, which counts what React renders.
  Sixty moves of the pointer across the wallet, with the Select tool and one move a frame,
  rendered App sixty times and 17,880 components, about 298 a move, in 180 commits. The panels,
  the tool bar and the tabs all rendered with unchanged inputs, just so the status bar's
  coordinates could change. The chain: `CanvasHost` kept the point under the pointer
  (`cursorMm`), and the pointer's place over the canvas, in React state; each move rendered the
  board, and an effect then sent App a new status, which rendered the window. Nothing else on
  screen changes with a hover: the halo and the rulers' tick are painted from refs.
- [x] Localize cursor consumers; use narrow subscriptions, stable props and memoized derived
  panel data where justified. Keep imperative canvas ownership. Both values are now
  `PointerValue`s (`renderer/src/pointerValue.ts`), a store read through
  `useSyncExternalStore`. Only what shows them subscribes: the readout (`CursorReadout` in
  `App.tsx`), and the two notices beside the pointer, mounted only while shown. The status keeps
  what changes rarely, each set only when it changes. Nothing else renders on a hover, so no
  panel needed memoising; the canvas is drawn as before.
- [x] Confirm unrelated panels no longer update; verify selection, properties, diagnostics,
  accessibility announcements and keyboard behavior. Guarded in the sharded E2E by
  `e2e/pointer-renders.spec.ts`, which counts renders through `e2e/renderCount.ts`, the hook
  React reports each commit to, as React DevTools counts them. Over sixty moves, App must not
  render, and at most sixty components may render in all, one a move: the readout. `b0ab404`
  renders App 60 times and 17,880 components. The whole E2E suite passes, with its selection,
  Properties (a drawn shape's sizes still go through the status), problems, keyboard and axe
  tests, and the readout's tests read it as before.

| PERF-007, sixty pointer moves across the wallet, one a frame, 7 runs each | Before (`b0ab404`) | After |
|---|---|---|
| React commits | 180 | 60 |
| App renders | 60 | 0 |
| Component renders | 17,880 | 60, the readout |
| Renderer script time, median (range) | 114.2 ms (112.1–120.7) | 41.4 ms (39.2–44.7) |

Measured with `node tools/perf-pointer.mjs` on the production build in unpackaged Electron 45.0.0,
in the pinned Playwright container (`v1.64.1-noble`) under Xvfb, the window at 1600 × 1000.
Before: `b0ab404`, built in a worktree of its own. Runs interleaved, before and after, seven of
each. The counts were the same in every run of a build. Script time is CDP's `ScriptDuration`
over a second sweep with nothing counted, on the audit's machine with other agents' builds beside
it: a trend, not a budget.

**Not done / not verified.** A move that changes the document — a drag, a shape being drawn —
still renders the window, as the document's change should; a shape being drawn sends its sizes,
which Properties mirrors. Each move still hit-tests and paints the board whole: that is PERF-008
and PERF-014. Measured on Linux only: the change is the renderer's JavaScript, with no platform
path.

**Result:** a pointer moving over the board renders the readout and nothing else. App and the
panels render when something they show changes.

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

- [x] Define captured-snapshot, dirty-state and cancellation semantics before changing execution.
  Reproduced at `a806a1b`: saving the path-heavy project (`fixtures/perf/traced-40x500.lcp`, 470
  KB) was a 103–128 ms long task every time, and so was each recovery copy; bundled, 117 ms of
  encoding — 38 ms of stable JSON, 78 ms of deflate. The semantics, unchanged: a save writes the
  document from before a gesture under way (Q36), a copy the document as it is, each as it was
  when asked, and the tab is saved as of that document once the write lands (Q16). A save is
  never cancelled. A recovery copy whose tab is saved, reloaded or closed while it is being made
  is not written.
- [x] Use an asynchronous persistence boundary for expensive pure work; keep one in-flight
  recovery and coalesce queued work to the latest required snapshot.
  `renderer/src/lcpEncoder.ts`: one worker (`lcpWorker.ts`), kept for the window's life, runs
  `saveProject` on the structured clone `postMessage` makes as the save is asked, and answers in
  the order asked, so saves, copies and kept copies reach the main process in that order. A
  worker that cannot start, stops, or does not answer in 30 s has what was waiting, and what
  follows, made on the window's thread, in order: a save is never lost to a missing worker.
  `renderer/src/recoveryCopies.ts`: a tab's copy is made one at a time, and written only if it is
  still the tab's when it is ready; the next is of the document as it is then. Recovering still
  asks for the tab's own copy before letting the crashed one go. Saves, recovery copies, kept
  copies and templates all go this way; opening still unzips and checks on the window's thread
  (31 ms for this project), and is not changed.
- [x] Verify edits during saving, failed writes, recovery, close/open, migrations and deterministic
  serialization; preserve parameter-only files and previous-file safety.
  `lcpJob.test.ts`: the worker's bytes, from a structured clone, are `saveProject`'s for the
  wallet, the strap, a traced outline and the version 12 format fixture. `recoveryCopies.test.ts`:
  a copy of the document asked for though it is edited meanwhile; none written for a tab saved
  or closed while it was made; one at a time; recovering's order; a write that fails is written
  again. `lcpEncoder.test.ts`: order, the fallbacks and the watchdog. Q36's save test, the
  recovery, unsaved-changes, tabs and preferences E2E specs pass unchanged. The main process,
  its atomic writes and `fsync`, and what a file holds are untouched.

**Expected benefit:** Lower renderer blocking; total CPU work may remain similar. Coordinate
roadmap Q35 (durability) and Q36 (saving a live preview) without silently resolving those policies.

| PERF-009, path-heavy project, built app, 1600 × 1000 | Before (`a806a1b`) | After |
|---|---|---|
| Ctrl+S: long tasks, 9 saves | 105–128 ms, every save (median 111) | none |
| Ctrl+S: largest frame gap | 83–117 ms (median 100) | 17 ms, every save |
| Ctrl+S: until the file is on disk | 334–359 ms (median 340) | 336–637 ms (median 363) |
| Recovery copy: long tasks, 9 copies | 107–115 ms, every copy | none |
| Recovery copy: largest frame gap | 100 ms | 17 ms, every copy |

Measured with `node tools/perf-save.mjs` on the production build in unpackaged Electron, under
Xvfb in the pinned Playwright container, three runs of three saves and three copies each, before
and after turn about, on the audit's Ryzen 5 7600X with the load at 2.5–4.7 from other work. A
save or a copy is timed once the panel drawn before it has settled, so it measures the file. The
file takes as long to reach the disk, a little longer when the machine is busy: the worker's
round trip. On the window's thread a save is now the structured clone `postMessage` makes, 11–13
ms for this project as `structuredClone` measures it, both ways.

**Guards:** `lcpJob.test.ts`, *is made into bytes only by the .lcp job, which the worker runs*:
the renderer's files that encode a project, by `saveProject(` in their source — `App.tsx`,
`useProjectFile.ts` and `useRecovery.ts` on `a806a1b`, the job's alone now. And
`e2e/lcp-worker.spec.ts`, since only the built app shows the worker: a save and a recovery copy
of the path-heavy project are each answered by the `.lcp` worker, and the saved file opens again
as saved; on `a806a1b`'s build no worker answers (`Expected: 1, Received: 0`).

**Result:** saving a large project, or writing its recovery copy, no longer stops the window. Not
done: opening, 31 ms for this project, still runs on the window's thread; it happens once a file,
and was not on the interaction path the audit measured. Measured on Linux only; CI's Windows and
macOS jobs run the unit tests, and the packaged app is checked by hand before the release.

### PERF-010

**Release previous-project view/tool caches.** Memory lifecycle.

**Locations:** [`CanvasHost.tsx`](../apps/desktop/src/renderer/src/CanvasHost.tsx), `sheetsCacheRef`
(205–225, 569–589); [`tool.ts`](../packages/editor/src/tool.ts), cached snap index (384–390).

**Evidence/impact:** Last-use refs survive document replacement until the view/tool is used
again. After New from a large Sheets project, heap was 69.2 MiB; replacing caches reduced it to
25.3 MiB, with no PDF worker at either checkpoint. This retains the last project, not every one.

- [x] Clear document-lifetime geometry caches explicitly on New/open/reset.
  Reproduced at `d091cb4`, on today's paths. Since tabs (8.12), *New*, opening and a tab switch
  make the board again, keyed by its tab, and a project still open in another tab is kept, as it
  should be. What outlived a project was kept "for the last one", in three places: the board's
  Sheets pages (`sheetsCacheRef`, 18 MiB for the strap), held after an edit on Design or a
  *Reload from disk* until Sheets was shown again; the tool manager's snap index, held after a
  reload until the next snapped pointer move; and `sheets.ts`'s plan, scene and evaluation of
  the project last asked about, held after the last tab closed until another project opened.
  The pages now live beside the plan in `sheets.ts` (`sheetsPagesFor`), for the project on
  screen alone, so the board keeps none and the next paint after an edit or a reload lets them
  go; `ToolManager.reset()`, Q39's `cancel()` renamed, drops the index with the gesture; and the
  window lets go of `sheets.ts`'s project (`releaseDerived`) once no tab is left.
- [x] Repeat actual open/New cycles, inspect retaining paths and verify prompt post-GC release.
  `node tools/perf-retention.mjs` (below). The retaining paths came from heap snapshots of the
  production build: the closed project through `sheets.ts`'s `latest`, the reloaded one through
  the board's ref and, for its document alone, React's fibers (see *Not done*). Guarded without
  timings, in `pnpm test`, by collecting through `WeakRef`s: `sheets.test.ts` holds that a
  project's pages, and the project, are collected once another is asked about and once none is
  on screen; `tool.test.ts` that `reset` lets the replaced project go. Each fails with its fix
  taken out. The board's own keeping only the real app shows, so `e2e/retention.spec.ts` holds
  it there, in the sharded E2E: on the strap, the post-GC heap after an edit, a reload and its
  tab closed stays under half the Sheets pages that run measured (about 19.4 MiB) over where it
  began — 2.4, 3.1 and 4.0 MiB against 9.7. `d091cb4`'s build reads 20.5 and 21.2 for the
  first two, and the fix without `releaseDerived` 23.1 for the third.
- [x] Preserve intra-document reuse, intended camera state and tool cancellation; coordinate Q39
  (unfinished tools on open) so cleanup has one lifecycle boundary. The pages are still built
  once for a project and its words, and a pan or a halo builds none (`sheets.test.ts`); an edit
  made new ones before as well, since a new project has a new plan. The cameras are the tab's and
  untouched. Q39's test passes under the new name. A document replaced in place has one
  boundary, `DocumentStore.onReset`; everything else goes with the board, or with the project on
  screen.

| PERF-010, 5.8 m strap, renderer heap after full GC, median of 7 (range) | Before (`d091cb4`) | After |
|---|---|---|
| Start screen, before any project | 6.72 MiB (6.70–6.74) | 6.72 MiB (6.70–6.75) |
| The project open, after Sheets and Design | 30.31 MiB (30.29–30.32) | 30.29 MiB (30.29–30.31) |
| A panel drawn on Design | 30.61 MiB (30.60–30.62) | 12.51 MiB (12.50–12.52) |
| *Reload from disk*, on Design | 31.33 MiB (31.32–31.33) | 13.22 MiB (13.21–13.23) |
| Its tab closed, back on the start screen | 12.51 MiB (12.50–12.52) | 11.43 MiB (11.43–11.44) |
| The closed project still reachable | 7 of 7 runs | 0 of 7 |

Measured with `node tools/perf-retention.mjs` on the production build in unpackaged Electron
45.0.0, in the pinned Playwright container (`v1.64.1-noble`) under Xvfb at 1920 × 1080, with the
window at 1600 × 1000 — on the desktop, a covered window draws nothing and each run stalls for
minutes. Before: `d091cb4`, built in a worktree of its own; runs interleaved, before and after,
seven of each, on the audit's machine with other agents' builds beside them, which moves none of
these figures. A figure is `Runtime.getHeapUsage` after two `HeapProfiler.collectGarbage`; the
retaining paths were read from heap snapshots of the same builds. The audit's 69.2 → 25.3 MiB
belongs to the window of one project, before tabs: today *New* opens a tab beside the project,
which stays open, and kept, in its own.

**Not done / not verified.** Right after a reload, the replaced project's document and evaluation
(not its pages, its plan or its index) are still held by React: the fibers' previous props and the
closures of the last render, before and after this change. They went in every run once Sheets and
Design had been shown again; React's own double buffering, not a cache, so left as it is. The
4.7 MiB the start screen keeps after the first project is not that project, which is unreachable;
what it is was not examined. Measured on Linux only: the change is the renderer's JavaScript, with
no platform path, and CI's Windows and macOS unit jobs run its guards.

**Result:** what a project derives for the screen now goes with it. An edit on Design or a reload
lets the last revision's Sheets pages go, 18.1 MiB on the strap, and closing the last tab lets the
project go; the open project keeps what it reuses.

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

- [x] Define justified aggregate work/expanded-byte limits at trust boundaries before allocation.
- [x] Provide typed refusals or explicit large-operation handling, never silent omission,
  simplification or scaled output; evaluate compatibility with existing valid files.
- [x] Test oversized valid and compressed inputs without exhausting the test machine; verify
  ordinary large projects still work and failure preserves the previous document.

**Expected benefit:** Predictable, recoverable failures instead of resource-exhaustion risk.

**Done (2026-11-02):** `perf/012-resource-preflight`. The limits and rationale,
including the capacity implications for schema-valid files, are in
[Resource limits](resource-limits.md). No format change, migration, dependency or snapshot update.

- `core` owns typed `ResourceLimitError` facts and the ceilings: 32 MiB archive/expanded bytes,
  1,024 archive entries, 500,000 JSON values, 10,000 parts/features/guides, 250,000 stored/resolved
  path segments, 20,000 characters in names and labels, 250,000 holes and 1,000 sheets including assembly maps.
- ZIP directory sizes are checked without inflating any entry; required entries are then streamed
  in bounded chunks and checked against their actual aggregate output. False size headers cannot
  bypass the ceiling. JSON/project counts are checked before schema/graph preparation.
- Every corner run is planned before placing holes. Evaluation counts previous sets, mirrors and
  cache hits too; an excessive request refuses the operation whole. Pagination compares layout
  candidates, then counts all tiles and assembly maps before making a grid.
- The desktop admits a new document through its existing sheet-plan derivation before publishing
  it. A refused command/preview/open/reload keeps existing work and history. Smaller papers that
  exceed the budget are visible but unavailable. A refused recovery keeps its offer and file;
  dismissing it keeps the copy through a clean exit, including a refusal while loading it.

**Before/after on current develop (`05c54ee`), Linux, Node 24.22.1:**
`node --expose-gc tools/perf-resources.mjs --root <tree>` bundles each tree's production functions
with Vite. Three runs per side, interleaved before/after; three fresh samples per request per run,
no warmup. The counts/refusals are the primary metric. Times below are informational medians of
nine samples on a shared machine, not CI timing ceilings or a claim about battery use or OOM.

| Request | Before | After | Median ms, before → after |
|---|---|---|---|
| 32 m square, 0.5 mm pitch, holes at corners | 256,000 holes generated | Refused before placing any hole; 256,004 corner candidates | 58.268 → 0.256 |
| 200 m × 20 mm strip, A4 portrait | 1,112 tile pages allocated | Refused before allocating a tile grid | 1.005 → 0.172 |
| Small valid archive whose document claims 64 MiB expanded | Size trusted, file accepted | Refused at directory preflight | 0.983 → 0.107 |

The original 100 m × 100 m audit input is covered by deterministic guards without allocating
its roughly 800,000 holes or huge grid. A bounded 32 MiB+1 expansion with false local/directory
sizes proves the actual-output guard. A byte-flip fuzzer counterexample (seed 530817745) is kept as
a named regression; resource refusals are now an explicit allowed fuzzer outcome.

**Accuracy/compatibility:** the harness's SHA-256 results match before and after for all sixteen
saved `.lcp`, PDF, SVG and DXF outputs: wallet (2 sheets), print test (3), 5.8 m strap (33) and
500-point trace (13). All format fixtures and unknown-field preservation tests pass. Forty
500-point traced parts still evaluate whole, with over 18,000 holes. No existing geometry,
golden, SVG or pixel baseline was rewritten. Schema-valid work beyond a ceiling is explicitly
refused without altering the file; the limits do not bound total process memory or the OS read
that supplies the archive byte array.

**Verification:** `pnpm check` passes: 3,765 tests, six performance guards, all static stages,
98 % lines and 94.01 % branches across the pure layers. The full Electron suite passes 332/332
in the Playwright 1.64.1 Noble image with Poppler 24.02.0 and Node 24.22.1, under a 2560 × 1440
Xvfb display with Poppler required. The app was launched and its refusal screenshot inspected.

**Test-environment findings:** a shared-desktop run hit hover/focus failures; the three affected
unchanged tests passed three repetitions on an isolated display. The bare Playwright image lacked
Poppler. A virtual screen exactly as wide as the largest test window returned 1919 px when asked
for 1920; unchanged develop reproduced that, and a larger screen resolves it. One existing hints
spec could record a smaller, previous hint set after a growing window, before its ResizeObserver
update reached React. Its five-hint expectation is now awaited before recording the count, in a
separate test-only commit; the original assertions and timeouts stay.

**Platform limit:** local validation is Linux. CI's Windows/macOS unit and packaged checks must
pass; manual packaged-app and physical printing checks there remain release-checklist work.

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

PERF-002b already ends the PDF *writer* with the effect and skips opening a file the effect has
left behind; pdf.js's own loading task and the thumbnails remain here.

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

- [x] Add per-evaluation resolved-node reuse and shared traversal state where justified.
  Reproduced at `b0ab404` with `mirrorChain(depth)` (`workloads.ts`: a stitch line mirrored, and
  each mirror mirrored back, depth times): warm evaluation of depth 500, 15.8 ms; the graph check
  8.3 ms; the parts tree 7.1 ms; each a walk up the chain for each feature down it.
  `domain/src/evaluate.ts` keeps each feature it has resolved in the evaluation's `Scope` and
  reads it the next time; a resolution depends on what the feature follows and nothing else —
  the `visiting` set only decides whether a cycle is thrown, and a thrown cycle is never kept.
  `domain/src/graph.ts` finds every feature on a cycle at once, `featuresOnCycles`, by Tarjan's
  strongly connected components through sources, folds and dimensions, with its own stack;
  `domain/src/featureTree.ts` settles each feature once as reaching a root or not.
- [x] Property-test branching/shared/cross-part dependencies, cycles and per-feature error
  attribution; compare shallow and deep timings without changing geometry results.
  `evaluate.test.ts`: over graphs of drawn, offset, mirrored, folded and holed features that
  follow any feature in any part, before or after them, one that is not there, or themselves,
  each feature resolves as it does in a copy sharing no object, alone with only what it follows,
  and with the parts' features reversed. `graph.test.ts`: `featuresOnCycles` equals the old walk
  from each feature over 1,000 graphs with folds, dimensions, missing targets and self-loops.
  `featureTree.test.ts`: equal to the old function, kept in the test, over 1,000 parts, and a
  feature leading into a cycle is still a root. Every existing evaluation, graph, tree and
  geometry test passes unchanged.

**Expected benefit:** Remove repeated ancestry work; keep below common-workflow fixes in priority.

| PERF-015, bundled (`tools/perf-compute.mjs`), median | Before (`b0ab404`) | After |
|---|---:|---:|
| Warm evaluation, chain of 10 / 100 / 500 | 0.01 / 0.64 / 15.85 ms | 0.00 / 0.02 / 0.09 ms |
| Fresh evaluation, chain of 100 / 500 | 0.77 / 16.54 ms | 0.14 / 0.64 ms |
| Graph check, chain of 100 / 500 | 0.38 / 8.32 ms | 0.06 / 0.22 ms |
| Parts tree, chain of 100 / 500 | 0.30 / 7.08 ms | 0.03 / 0.18 ms |
| 200 samples: graph check, wallet / 40 parts | 1.99 / 24.8 µs | 2.97 / 34.8 µs |
| 200 samples: parts tree, wallet / 40 parts | 1.76 / 21.4 µs | 2.72 / 25.9 µs |
| 200 samples: warm evaluation, 40 parts | 23.2 µs | 19.4 µs |

Measured on the audit's Ryzen 5 7600X, Linux 7.3.0-5-cachyos, Node 24.22.1, with the load at 3–8
from other work, before and after turn about: five runs each of 20 samples after 3 warm-ups, the
median of their medians, and three runs each of 200 after 20 for the small rows. The same
`workloads.ts` on both sides. A shallow project pays a few microseconds a check for the
bookkeeping: the graph check on 40 parts, 10 µs; the parts tree, 4 µs. The wallet's fresh
evaluation read 146 against 157 µs in one 200-sample run and 151 against 146 in another, run to
run noise at that load; every other fresh evaluation and diagnosis is level.

**Guards** (`pnpm test`), on the 500-deep chain, every read of a feature's `source` counted,
bound ten reads a feature, 5,020: a warm evaluation read 630,261 before
(`evaluate.test.ts`, *walks a chain of five hundred sources once*), `graphProblems` 507,014
(`graph.test.ts`), `featureTree` 253,007 (`featureTree.test.ts`); all fail on `b0ab404`'s code and
pass after.

**Result:** walks along a chain of sources are once an evaluation, once a graph check and once a
tree, at any depth. Not changed: the snap index of the 500-deep chain, about 520 ms, which indexes
the crossings of 250 identical stitch lines on each side of the axis — an artefact of the stress
workload, not a walk.

### PERF-016

**Prune obsolete collapsed-part IDs.** Small UI-state retention.

**Location:** [`PartsList.tsx`](../apps/desktop/src/renderer/src/PartsList.tsx), `closed` state and
`setOpen` (114–128, 184–189).

**Evidence/impact:** Collapsing adds IDs; explicit reopening removes them. Deleted/replaced
projects can leave obsolete IDs while the component stays mounted. This is small string
retention, not the measured large cache growth.

- [x] Prune against live part IDs or reset at the appropriate document boundary.
  Reproduced at `a806a1b`, and worse than the audit saw: since tabs (8.12) the one `closed` set
  was the whole window's. Parts is not made again for a tab, so the set outlived every closed
  tab, and two projects shared it: the template gives every bifold wallet the same part ids, so
  a second wallet opened with the first one's pieces already folded, and so did the wallet that
  stayed once the second was closed. Only the start screen, which unmounts Parts, emptied it.
  The boundary is the tab: it keeps its folds (`ProjectTab.folds`, like its cameras), Parts is
  keyed by the tab and reads them on mount, and they go with the tab. Pruning to live ids was
  not taken: it would lose the fold of a piece deleted and brought back by undo.
- [x] Exercise collapse/delete/open cycles and preserve intended expansion behavior on ordinary
  edits and undo/redo. `node tools/perf-folds.mjs` (below) runs open, fold, draw, close cycles
  beside a wallet that stays open. Within a tab the set works as it did: a piece deleted and
  brought back by undo comes back folded, and a selection on the board still opens its piece
  (its own test, unchanged). A fold now also survives a visit to Sheets, which has its own Parts
  panel and so unmounted the tree and lost every fold. Guarded in the sharded E2E by
  `e2e/parts-tree.spec.ts`'s three PERF-016 tests, which count the pieces the tree shows
  folded: in a second wallet that folded none, in the tab that stayed and in a wallet opened
  after the folding tab closed, the count must be 0 where `a806a1b` shows 3; a fold must still
  show after Sheets, where `a806a1b` shows it open; and the undo above, which passes on both
  and fails if the set is pruned to the parts the project has.

| PERF-016, five open–fold–close cycles beside a wallet that stays open, 5 runs each | Before (`a806a1b`) | After |
|---|---|---|
| Folds Parts holds after each cycle's folding | 4, 5, 6, 7, 8 | 4, 4, 4, 4, 4 |
| …in the wallet that stayed, its folding tab closed | 4, 5, 6, 7, 8 | 0, 0, 0, 0, 0 |
| Pieces shown folded there, which folded none | 3 | 0 |
| A wallet opened after the cycles: folds held, pieces shown folded | 8, 3 | 0, 0 |

Measured with `node tools/perf-folds.mjs` on the production build in unpackaged Electron 45.0.0,
in the pinned Playwright container (`v1.64.1-noble`) under Xvfb, the window at 1600 × 1000.
Before: `a806a1b`, built in a worktree of its own. Runs interleaved, before and after, five of
each; every run of a build gave the same figures, so a median and a range would only repeat them.
The set is read off React's current fiber tree, from its root down: a DOM node's own fiber can be
the render before last, whose state is older.

**Not done / not verified.** Within a tab, a piece deleted keeps its id in the set until the tab
closes, so undo brings it back folded; a *Reload from disk* keeps the set too, which keeps the
folds of pieces the file still has. Both are bounded by the parts the tab's project has had.
Measured on Linux only: the change is the renderer's JavaScript, with no platform path.

**Result:** a fold is its project's. A project never shows another's folds, closing a tab lets
its folds go, and a fold lasts through a tab switch and a visit to Sheets.

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
  Per-package `benchmark.include`: 30 cases back to 15. Guarded by
  `apps/desktop/src/bench-discovery.test.ts`, which asks Vitest, as `vitest bench` sets it up,
  what it would run: the committed files each once, no project's globs taking a generated `dist/`
  copy (asked of the globs, so it fails with no `dist/` built), and as many cases collected in each
  package as it has baselines. Each fails on a regression made on purpose — the include line
  dropped, a case deleted, a loop of cases shortened — and passes without it. The
  export-getter warning is Vitest module-runner overhead, not a config fault; left visible and
  documented in `docs/testing.md`.
- [x] Add production-representative bundled timing where needed; distinguish it from Vitest
  timings and record commit, workload, runtime, hardware and sample method.
  `node tools/perf-compute.mjs` bundles the pure layers with the Vite that builds the renderer and
  runs the bundle in plain Node: the audit's computation table, its workloads (`bag(n)` joins
  `workloads.ts`) and four measures — fresh evaluation, fresh diagnosis, diagnosis after a
  rename, the snap index — 3 warm-ups and 20 samples each, inputs built outside the timing. It
  prints the commit, Node and V8, the processor, the kernel and the load before the table.
  `--root` measures another checkout with the same bundler, so before and after can be
  interleaved (`docs/testing.md` §9.1). Today's numbers are below.
- [x] Replace minimum-slowness assertions with meaningful upper budgets/behavior verification.
- [x] Coordinate roadmap Q40: measure shipping SVG/DXF writers rather than only render SVG.
  `export.bench.ts` reaches `exportSvg` and `exportDxf` through the package's index. Under
  `bench:compare` (2026-10-26) the shipped SVG writer took 2.11 ms against `svg.json`'s 0.375 ms,
  which had timed the render backend's `renderToSvgString`: a different function, not a
  regression. `svg.json` was re-recorded and `dxf.json` added (2.61 ms), on the machine that holds
  the others, Node 24.22.0, at 80afa43, load about 2. The other three export cases compared level
  and were kept.
- [x] Preserve existing baselines; version deliberate replacements with their environment.
  `docs/testing.md` §9.1 gives every baseline the commit, Node and Vitest it was recorded with,
  and why; `bench-discovery.test.ts` fails if a committed baseline has no row or a row names none.
  None was re-recorded here. Two were before, in #146: `export/bench/pdf.json` and `display-list.json` were 13–14× and 6–8× under
  `bench:compare` (2026-10-26) because their workloads had changed since 68c2709, not their code.
  The 1,200 mm strap did not fit A4 then, so it was reported oversized and the PDF placed nothing;
  tiling (7.2a) now prints it across 7 sheets, 744 KB — the old furniture-only sheet takes 12.6 ms
  on today's code, under its 19 ms baseline, and the rest is PERF-002. `git bisect` puts the
  display list at F.7 (8fd1503, a slit per hole: the 13→87 µs recorded in the roadmap), with U.2's
  caption on top. Both were re-recorded on the machine that holds the others, Node 22.23.3, at
  199cb50. The other 13 were kept; all but `diagnose-strap-slots` (1.4–1.6×, not yet examined)
  compare level.
  **`diagnose-strap-slots` is a regression, and its baseline is kept.** Bisected with
  `perf-compute.mjs --root` over every commit touching geometry or domain since 68c2709, the
  strap's diagnosis is 4.1 ms up to `f4edb37` and 6.3–6.8 ms from 3.9c (`2f1132a`) on. 3.9c built
  `distanceToPath` on its new `closestPointOnPath`, so a hole's distance to an arc is measured to
  the nearest point found on it — an angle, a parameter and a point — not radially as before; each
  of 3,028 holes asks it of 20 round slots. Putting the radial answer back for an arc took the
  diagnosis to 4.4 ms (reverted). Fixing it is [PERF-005](#perf-005)'s, which this cost is the
  evidence of, and needs its own proof that diagnostics are unchanged. PERF-005 fixed it another
  way, identical to the bit: a hole is not measured against an edge that cannot be nearest. It
  compares 0.52× now.
  The editor's four cases, code unchanged since `e845ffa` recorded them, compare 1.12–1.22× on
  2026-11-01: Node is 24.22.1 where it was 24.22.0, the kernel 7.3.0-5 where it was 7.3.0-4, and
  two other sessions kept the load near 1.5. That is the environment, not the code, so they were
  kept too — and it is why a baseline is read with its row.
- [x] Reconcile performance claims in architecture/testing docs with actual implementation:
  canvas layers/culling, cache identities, hole primitives and operation process ownership.
  `docs/architecture.md`: §6.2's three stacked canvases are one canvas, all of it drawn when the one
  dirty flag is set, and the loop asks for every frame (PERF-008, PERF-014); §8's culling is the
  Sheets view's alone; its batched `Path2D` of circles is one stroked path of slits (F.7) and a
  circle per punched hole; "a coarser flatten tolerance during a drag, refined on commit" was never
  built, and is forbidden — a preview is exact; diagnostics are memoised per project, not per part
  (PERF-005); the benchmark fixture "20 parts, 3 000 holes" is the strap, its slots and the traced
  outlines; and §1 says where PDF writing, serialising, zipping and file I/O run. R11 and
  `.claude/rules/document-and-editor.md` no longer promise an overlay-only repaint.
  `docs/testing.md`: 20 benchmarks, not 15, about 95 s, and §9.1 on baselines and bundled timing.

| PERF-017, bundled (`tools/perf-compute.mjs`), median ms | Fresh evaluation | Fresh diagnosis | Diagnosis after a rename | Snap-index build |
|---|---:|---:|---:|---:|
| Wallet | 0.34 | 0.48 | 0.35 | 0.28 |
| Long strap | 0.60 | 1.25 | 0.51 | 0.03 |
| Strap + 20 slots | 0.57 | 7.47 | 6.75 | 0.31 |
| 250-point outline | 2.08 | 8.01 | 4.09 | 0.87 |
| 500-point outline | 7.62 | 22.87 | 8.20 | 1.44 |
| 1,000-point outline | 29.03 | 73.40 | 16.41 | 2.86 |
| 30 simple parts | 0.95 | 1.77 | 0.75 | 1.85 |
| 40 simple parts | 1.12 | 2.14 | 0.99 | 3.08 |
| 50 simple parts | 1.38 | 2.82 | 1.24 | 5.60 |

The median of three runs' medians, each of 20 samples after 3 warm-ups; a cell's three medians
were within 5 % of each other above a millisecond, and up to 16 % apart below one. 2026-11-01, `d091cb4` with
this change, Node 24.22.1 (V8 13.6), Vite 8.3.5, the audit's Ryzen 5 7600X × 12 on Linux
7.3.0-5-cachyos, load about 1.3 from two other sessions. Beside the audit's
[table](#selected-results), measured another way at another commit: the same order everywhere.
*Diagnosis after a rename* is not the audit's *warm-geometry validation* — it is what a rename
costs, the project's whole diagnosis with every feature's evaluation reused — and the snap index
now keeps crossings by path (PERF-004), so it is cheaper for traced outlines and dearer for the
bags, whose holes it indexes one by one. Through `pnpm bench`'s module runner, the 500-point
outline's diagnosis is 146 ms; bundled, 23 ms.

**Result:** the benchmarks run once each, and each baseline says what it was recorded on. The
computation table can be measured again as the app runs it, on any checkout, and the docs say
what the canvas and the caches do today. Examined, `diagnose-strap-slots`' 1.3–1.4× is a
regression since 3.9c, handed to PERF-005 with its cause.

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
