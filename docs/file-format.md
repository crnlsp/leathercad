# File Format

**Package:** `packages/persist`
**Extension:** `.lcp` (LeatherCAD Project)
**MIME type:** `application/vnd.leathercad.project`
**Status:** Design — no implementation yet
**Last updated:** 2026-09-03

---

## 1. Container: a ZIP archive

A `.lcp` file is a ZIP archive, in the tradition of `.docx`, `.kra`, and `.sketch`.

```
project.lcp
├── mimetype               stored UNCOMPRESSED, first entry — "application/vnd.leathercad.project"
├── manifest.json          format version and provenance; readable without parsing the document
├── document.json          the project itself
├── thumbnail.png          512 px preview for file managers and the recent-files list
└── assets/
    └── <sha256>.<ext>     content-addressed binaries (tracing images, imported reference art)
```

### Why not a single JSON file

A bare `.json` is simpler for about two weeks. Then tracing images arrive and have to be
base64-encoded into the document, which inflates the file by a third and makes it unreadable. The
ZIP costs roughly thirty lines with `fflate` and solves that permanently, plus it gives a thumbnail
for free.

### Why not a binary format

JSON is human-inspectable, diffs cleanly in git, is trivially versioned, and can be read directly by
tests and by Claude Code. The usual argument for binary is size, and it does not apply here because
**derived geometry is never stored** (§3.3) — a complex bag project is tens of kilobytes of JSON, not
megabytes.

The `mimetype` entry stored uncompressed as the first archive member is the ODF convention: it lets
`file(1)` and desktop environments identify the format from the first few hundred bytes without
unzipping.

## 2. `manifest.json`

Deliberately tiny, and readable without touching `document.json`, so that a version check is cheap
and cannot fail on a document the current build does not understand.

```json
{
  "formatVersion": 1,
  "application": "LeatherCAD",
  "applicationVersion": "0.4.2",
  "createdUtc": "2026-09-03T14:22:10.000Z",
  "modifiedUtc": "2026-09-03T16:01:44.000Z",
  "assets": [
    { "path": "assets/9f2a…c1.png", "sha256": "9f2a…c1", "bytes": 184320, "role": "trace-image" }
  ]
}
```

`formatVersion` is a **single integer**, incremented on every breaking change. Not semver — semver
invites arguments about whether a change is minor, and the migration runner only cares about
ordering.

## 3. `document.json`

### 3.1 Shape

Format version 9, as the writer emits it (key order shown for reading; the writer sorts keys):

```jsonc
{
  "id": "01JBQ8…",
  "name": "Bifold Wallet",
  "settings": { "gridSpacingMm": 1, "defaultStitchInsetMm": 3.5, "defaultIronPitchMm": 3.85,
                "paper": "A4", "orientation": "portrait" },
  "parts": [
    {
      "id": "01JBQ9…",
      "name": "Outer panel",
      "quantity": 1,
      "features": [
        {
          "id": "01JBQA…", "kind": "cut-contour", "role": "outer", "name": "Outline",
          "visible": true, "locked": false,
          "source": { "kind": "shape",
                      "shape": { "type": "rect", "origin": { "x": 0, "y": 0 },
                                 "width": 190, "height": 95, "rotation": 0,
                                 "radii": { "topLeft": 8, "topRight": 8,
                                            "bottomLeft": 8, "bottomRight": 8 } } }
        },
        {
          "id": "01JBQB…", "kind": "stitch-line", "name": "Stitch line",
          "visible": true, "locked": false,
          "source": { "kind": "derived", "sourceId": "01JBQA…",
                      "op": { "type": "offset", "distanceMm": 3.5, "side": "inward",
                              "run": { "kind": "whole" } } }
        },
        {
          "id": "01JBQC…", "kind": "stitch-hole-set", "name": "Stitch holes",
          "visible": true, "locked": false,
          "source": { "kind": "derived", "sourceId": "01JBQB…",
                      "op": { "type": "stitch-holes", "pitchMm": 3.85, "mode": "fit-whole",
                              "corners": "hole-at-corner", "ironLabel": "KS Blade 3.85 mm" } }
        },
        {
          "id": "01JBQD…", "kind": "text-label", "name": "Zszyć przed klejeniem",
          "visible": true, "locked": false,
          "source": { "kind": "text", "text": "Zszyć przed klejeniem",
                      "at": { "x": 12, "y": 30 }, "sizeMm": 3, "rotationRad": 0 }
        }
      ]
    }
  ]
}
```

**Added in Phase 4** ([reconciliation](superpowers/specs/2026-09-15-phase-4-reconciliation-design.md)
§6), each with its own version bump and a committed fixture: `frozenFrom` on features (4.2b, format
version 4), the `text-label` kind and its `text` source (4.11b, format version 5), the `mirror` op
(4.8a, format version 6), the **fold-tracking mirror axis** (4.8b, format version 7 — the first
migration that rewrites data rather than passing it through), and the `measurement` kind with its
`measurement` source of two anchor references (4.10a, format version 8). The paper a project prints
on followed in 5.5, as version 9 (§4.1a). Materials, guides and a per-part placement transform are
not in the format.

A **fold-tracked mirror** stores *which fold*, never where that fold happens to be — the first
**references** edge in the format. Move the fold in a later session and the counterpart moves with
it.

A **mirror** stores an axis and a glide — where the fold is and how far the counterpart slides
along it — and not one coordinate of the reflected shape. The counterpart is recomputed from its
original on load, which is what makes editing the original in a later session still move it.

A label stores **what was typed, where it sits and how big it prints** — never its glyph outlines.
Those are regenerated from the vendored typeface on load, so improving the typesetting improves
every file that already exists.

Note what that wallet panel *does not* contain: a single coordinate of the stitch line, and not one
of its ~120 hole positions. Three parameter blocks regenerate all of it.

### 3.2 Conventions

- **Units.** Every number is millimetres unless the key ends in `Rad`, `Deg`, `Percent`, or is
  explicitly dimensionless. No unit strings inside the document — the format is mm, always.
- **Y-up**, matching the model. Exporters flip; the file does not.
- **Ids** are ULIDs: lexicographically sortable, timestamp-prefixed, no coordination needed.
- **Numbers** are written with at most 6 decimal places. Combined with the 1e-4 mm input
  quantisation ([geometry.md](geometry.md) §3.3), this makes saving an unmodified file
  byte-identical and makes `.lcp` diffs readable.
- **Except a stored path's segments, which are written exactly** (JavaScript's shortest round-trip
  form, so the same doubles come back).
  - A path, drawn or frozen, is geometry rather than a typed parameter, and it stores an arc as a
    centre, a radius and two angles.
  - Rounded to six decimals, an arc came back a few micrometres off the line beside it, and a
    millionth of a radian off tangent. The stitch-line offset read that as a concave corner at an
    arc and refused it, so a frozen rounded rectangle's stitch line built before a save and failed
    after one (found in slice 3.9a).
  - An unchanged document still saves byte-identically. Older builds read the longer numbers as
    they read any number, so this changes no format version.
- **Key order is stable** — serialise through an explicit writer, never `JSON.stringify` of an
  arbitrarily-ordered object. Stable ordering is what makes git diffs and round-trip tests useful.
- **No `undefined`.** Optional fields are either present or absent, never `null` as a placeholder.

### 3.3 What is never stored

| Never stored | Because |
|---|---|
| Derived paths (offsets, mirrors, booleans) | Recomputed on load; storing them locks in algorithm bugs and bloats files |
| Stitch hole positions | Same — a wallet has hundreds; three parameters describe them |
| Flattened polylines of curves | Flattening is a rendering and export concern with a tolerance |
| Bounding boxes, lengths, areas | Cheap to recompute; guaranteed stale if stored |
| Selection, active tool, zoom, pan | Session state, not document state |
| Window size, theme, recent files | Application preferences — see §6 |

The last two rows matter for a subtle reason: if the viewport were in the document, panning would
mark the file dirty, and every save would produce a diff. Session state stays out.

## 4. Versioning and migration

### 4.1 The runner

```ts
const CURRENT_FORMAT_VERSION = 4;

type Migration = { from: number; to: number; migrate(doc: unknown): unknown };

const migrations: Migration[] = [
  { from: 1, to: 2, migrate: v1_to_v2 },   // derived features
  { from: 2, to: 3, migrate: v2_to_v3 },   // hardware holes
  { from: 3, to: 4, migrate: v3_to_v4 },   // frozen features
];

function loadDocument(raw: unknown, fileVersion: number): Project {
  if (fileVersion > CURRENT_FORMAT_VERSION) throw new NewerFormatError(fileVersion);
  let doc = raw;
  for (const m of migrations.filter(m => m.from >= fileVersion)) doc = m.migrate(doc);
  return ProjectSchema.parse(doc);        // zod — validate only after migrating
}
```

### 4.1a Version 9 — the paper a project prints on

`settings.paper` and `settings.orientation` (slice 5.5). Before them there was nowhere to store the
choice, so `exportPdf` fell back to `DEFAULT_PAGE_SETUP` and **every project ever saved printed A4
portrait**.

So `v8_to_v9` writes exactly that — `"A4"` and `"portrait"` — and the reason is not that they are
sensible defaults. A migration may describe what a document *already meant*; it may not decide
something new on the user's behalf. Anything else would change what comes out of the printer for a
file someone may already have cut a pattern from. `fixture.test.ts` asserts it across the **whole
corpus**, v1 through v8, not just the most recent file.

**The name is stored, not the dimensions.** A stored `210 × 297` would be a second definition of A4,
free to drift from the one in `packages/domain/src/paper.ts`. That module is also why the paper
vocabulary lives in the domain at all: `ProjectSettings` has to name it, and `domain` cannot import
`packages/export`.

**Margins and the 62 mm verification footer are deliberately not stored.** They are constants in
`packages/export`, they are already correct, and changing them has print-accuracy consequences — a
setting nobody has asked for is a setting that can be got wrong.

### 4.2 The rules

1. **Version 1 and a working runner ship with the first save implementation**, before any release.
   Retrofitting migrations after real user files exist is the kind of pain that is entirely
   avoidable by spending an hour now. (Risk R10 in [architecture.md](architecture.md).)
2. **A shipped migration is immutable.** Never edit one; if it was wrong, write another after it.
3. **Never delete a migration.** The chain must reach back to version 1 forever.
4. **Every version bump commits a fixture.** `fixtures/format/v1.lcp` is a real file from the v1
   writer and is **never regenerated** — rewriting it would delete the only proof that an old file
   still opens. Only the current version's fixture is regenerated, with
   `UPDATE_FIXTURES=1 pnpm test packages/persist`. `fixtures/format/v<N>.lcp`, a real file saved by that
   version, with a test that opens it and asserts the resulting document. That corpus is the only
   thing that proves the chain still works, and it costs one file per bump.
5. **Migrations run on raw JSON**, before zod validation. Validating first would reject old files by
   definition.
6. **A newer file is refused, not guessed at.** Opening `formatVersion` above `CURRENT` shows "This
   file was made with a newer version" rather than silently dropping the fields it does not
   recognise.

### 4.3 Unknown-field preservation

Within a known version, unknown properties on known objects are **preserved** through a load/save
cycle rather than dropped. This means a file touched by a newer minor build is not quietly damaged
by an older one. It is cheap to implement in the deserialiser, and it removes a whole category of
data-loss bug reports.

**How (5.2):** every object in `ProjectSchema` is a zod 4 `looseObject`. An unknown key stays on the
object it was found on, the app carries it untouched, and `stableJson` writes it back, so an
unedited round trip is byte-identical.
- **The guarantee.** Unknown data is **never silently discarded** by opening, by saving, or by an
  ordinary in-place edit, one that changes an object and keeps it. Every command copies the project,
  its settings, parts and features when it changes them. It also copies a feature's source, shape
  and derivation when it moves, turns, scales, retypes or re-parameterises them.
- **The exception.** Unknown fields are not carried over when an edit **replaces** an object with a
  new one of a different kind, or **recomputes** a geometric primitive. Two edits do that:
  - **freezing** a derived feature into drawn geometry replaces its derived source with a path;
  - **moving or transforming a drawn path** recomputes the path and its segments. The source that
    holds the path is kept.

  Unknown fields on the replaced object go with it, because this build cannot tell whether a field
  it has never seen still describes the new object. The feature, and every object the edit kept,
  keep theirs. Both edits are pinned by tests (`apps/desktop/src/renderer/src/unknownFields.test.ts`)
  so that the exception is documented rather than implied.
- **Numbers** in unknown fields are written to six decimals, like every number in the file.
- **The manifest** describes the writer and is written fresh on every save, so it is not preserved.
- **Security.** zod neither keeps nor honours a `__proto__` key, and known keys are validated
  exactly as before.
- **Why not the `_ext` bag first sketched here.** The behaviour is identical, including under edits.
  The bag would need a tree walk in each direction and an `_ext` field on every domain type, and
  nothing in the domain would read it. See
  [the design](superpowers/specs/2026-09-23-unknown-field-preservation-design.md).

### 4.4 Migrations are not the only forward-compatibility tool

Because derived geometry is recomputed rather than stored, many changes that would be breaking in
another format are free here. Improving the offset algorithm, changing the flattening tolerance, or
fixing a corner-policy bug all improve existing files with **no migration at all** — the parameters
did not change, only their interpretation. This is a real, ongoing dividend of §3.3.

### 4.5 The compatibility policy for 1.x

*Accepted at the 1.0 boundary review (2026-09-23).* Until then each rule was followed in practice,
but nothing stated what a release promises.

1. **Backward, always.** Every file any released version wrote opens in every later version.
   Migrations are immutable (invariant 9), and the corpus (§4.2 rule 4) proves each one.
2. **A change to what is drawn, cut or printed bumps `formatVersion`.** An older build refuses the
   newer file with a sentence that tells the maker to update. It never opens a file whose meaning it
   would silently get wrong. A new optional geometric parameter is exactly that case: an older build
   would ignore it and cut the wrong thing.
3. **A metadata-only addition keeps the version.** That means a note, a colour, or a display hint:
   nothing that changes what is drawn, cut or printed. An older build opens the file and carries the
   field through open, edit and save (§4.3). This is the case §4.3 exists for. Under rule 2 alone it
   would never arise.
4. **Unknown data is never silently discarded during load, save, or an ordinary in-place edit**
   (§4.3). Two things are not preserved, and both are documented:
   - the manifest, which describes its writer and is rewritten on every save;
   - the unknown fields of an object an edit replaces or recomputes: a frozen feature's old source,
     and a moved path and its segments.

No supported-version window is needed. Rule 1 makes compatibility unbounded backwards, and rule 2
keeps forward compatibility safe by refusing rather than guessing.

## 5. Validation on load

`zod` schemas mirror the domain types and run at the load boundary — the one place untrusted data
enters the system.

After the schema, the **reference graph** is checked (`domain-model.md` §8.2, S1–S4): a feature
following one that does not exist, a loop, a derivation the compatibility table does not allow, or a
repeated id refuses the file, naming the feature. A file can satisfy the schema and break the graph,
and everything past the loader assumes a sound graph
([ADR 0009](adr/0009-explicit-resolution-when-deleting-a-source.md)).

- Parse failures produce a **path-qualified message** (`parts[2].features[0].source.distanceMm:
  expected number, got string`), not "invalid file".
- Referential integrity is checked after schema parsing: every `fromId`, `stitchLineId`,
  `materialId`, and `ironPresetId` must resolve. A dangling reference becomes a
  `BROKEN_DERIVATION` diagnostic, not a load failure — the user should get their file back with a
  problem flagged, not a refusal.
- Cycle detection runs on load. A cyclic file (only reachable via hand-editing or a bug) loads with
  the offending edges severed and an error diagnostic.
- Numeric sanity: reject `NaN`, `Infinity`, and coordinates outside ±100 000 mm.

**Principle: recover where recovery is unambiguous; refuse where it is not.** A user's project file
is hours of their work.

## 6. What lives outside the file

Application preferences go in `$XDG_CONFIG_HOME/leathercad/` (falling back to `~/.config/`):

```
~/.config/leathercad/
├── preferences.json      theme, default paper size, snap defaults, keybindings
├── printers.json         per-printer calibration factors — see printing.md §8
├── recent.json
└── library/
    ├── parts/*.lcpart    saved part templates
    └── irons.json        user-defined iron presets
```

What the app writes about *itself* is state, not configuration, and goes in
`$XDG_STATE_HOME/leathercad/` (falling back to `~/.local/state/`), per
[ADR 0015](adr/0015-local-logs-and-crash-dumps.md):

```
~/.local/state/leathercad/
├── logs/main.log         one megabyte, then main.old.log; nothing is uploaded
├── crashes/              native crash minidumps, kept locally
└── recovery/             crash-recovery copies, one per session (§7)
```

On Windows and macOS the same tree lives in the app's user-data folder (`stateDirectory()`).

The split is by lifetime and portability: **a `.lcp` sent to another leatherworker must open
identically on their machine**. Anything that would change what they see belongs in the file;
anything that reflects *their* setup — their printer's calibration, their theme, their window
size — belongs in preferences.

## 7. Autosave and recovery

*As built in 5.3b.* See [the crash-recovery design](superpowers/specs/2026-09-23-crash-recovery-design.md).

- **What and when.** While the project has unsaved changes, it is written as an ordinary `.lcp` at
  most once a minute. It is never written in the middle of a drag, and never again until it
  changes.
- **Where.** `stateDirectory()/recovery/<pid>-<start>.lcp`: one file per session, never beside
  the project, and never under a project's name. Two running copies of the app never touch each
  other's file.
- **How.** Every write goes through a temporary file and a `rename()` over the target. `rename`
  within a filesystem is atomic, so a crash mid-write leaves the previous copy whole. **The same
  applies to normal saves**: never write in place over the user's project.
- **On startup.** A copy whose process is no longer running belongs to a session that did not end
  cleanly, and the newest one that loads is offered.
  - *Recover* opens it **untitled and unsaved**, so it can never be saved over the file it came
    from.
  - *Not now* keeps it until the next clean exit.
  - A copy that does not load is renamed `.corrupt` and never offered again.
- **Cleanup.** The copy is deleted when the project is clean again (saved, new or opened) and at a
  clean exit. A renderer crash keeps it through the quit that follows.

## 8. Companion formats

- **`.lcpart`** — a single saved part for the user library. Same JSON shape as one `parts[]` entry
  plus the `manifest`, in the same ZIP container. Same migration chain.
- **`.lcp.json`** — an *export* option that writes the document as plain, pretty-printed JSON with
  no container. Not the native format, but worth having: it makes projects diffable in git, which
  open-source users and anyone version-controlling their patterns will want. Read support too, so
  the round trip is complete.

## 9. Tests this format needs

Detailed in [testing.md](testing.md); listed here so the format's obligations are visible in one
place.

1. **Round trip.** `parse(serialise(doc))` deep-equals `doc`, as a property test over generated
   documents, not just examples.
2. **Byte stability.** Serialising the same document twice produces identical bytes; loading and
   re-saving an untouched file produces identical bytes.
3. **Derived-geometry equivalence.** Evaluating a document, saving, loading, and re-evaluating
   produces geometry identical within `EPS_POINT`. This is what proves §3.3 is safe.
4. **Migration chain.** Every `fixtures/format/v<N>.lcp` opens and produces the expected document.
5. **Rejection.** A file with `formatVersion` above current is refused with the right error.
6. **Corruption.** Truncated ZIP, missing `document.json`, malformed JSON, wrong mimetype — each
   produces a specific, actionable error rather than a crash.
7. **Unknown-field preservation.** A document with extra properties survives a load/save cycle,
   byte for byte, at any object in it. It also survives the commands that copy the objects they
   edit (`unknownFields.test.ts` in `persist` and `apps/desktop`).
8. **Referential integrity.** A dangling `fromId` loads with a `BROKEN_DERIVATION` diagnostic rather
   than throwing.
