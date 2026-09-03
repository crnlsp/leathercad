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

```jsonc
{
  "id": "01JBQ8…",
  "name": "Bifold Wallet",
  "settings": {
    "gridSpacingMm": 1,
    "gridMajorEvery": 10,
    "defaultStitchInsetMm": 3.5,
    "defaultIronPresetId": "iron-3.85",
    "page": { "size": "A4", "orientation": "portrait",
              "marginsMm": { "top": 10, "right": 10, "bottom": 10, "left": 10 },
              "overlapMm": 10 }
  },
  "ironPresets": [ { "id": "iron-3.85", "name": "3.85 mm", "pitchMm": 3.85 } ],
  "materials":  [ { "id": "mat-veg32", "name": "Veg tan 3.2 mm", "thicknessMm": 3.2,
                    "displayColour": "#c9a227" } ],
  "guides":     [ { "id": "g1", "origin": { "x": 0, "y": 0 }, "angleRad": 0 } ],
  "parts": [
    {
      "id": "01JBQ9…",
      "name": "Outer panel",
      "quantity": 1,
      "materialId": "mat-veg32",
      "grainDirectionRad": 0,
      "transform": { "a": 1, "b": 0, "c": 0, "d": 1, "e": 20, "f": 20 },
      "features": [
        {
          "id": "01JBQA…", "kind": "cut-contour", "name": "Outline",
          "visible": true, "locked": false, "role": "outer",
          "source": { "kind": "shape",
                      "shape": { "type": "rect", "origin": { "x": 0, "y": 0 },
                                 "w": 190, "h": 95, "radii": [8, 8, 8, 8] } }
        },
        {
          "id": "01JBQB…", "kind": "stitch-line", "name": "Perimeter stitch",
          "visible": true, "locked": false,
          "source": { "kind": "offset", "fromId": "01JBQA…", "distanceMm": 3.5,
                      "side": "inward", "join": "round", "miterLimit": 4 }
        },
        {
          "id": "01JBQC…", "kind": "stitch-hole-set", "name": "Perimeter holes",
          "visible": true, "locked": false,
          "stitchLineId": "01JBQB…",
          "pitchMm": 3.85, "ironPresetId": "iron-3.85",
          "distribution": "fit-whole",
          "cornerPolicy": { "kind": "hole-at-corner", "cornerAngleThresholdDeg": 30 },
          "startOffsetMm": 0, "endOffsetMm": 0,
          "hole": { "shape": "round", "diameterMm": 1 }
        }
      ]
    }
  ]
}
```

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
const CURRENT_FORMAT_VERSION = 1;

type Migration = { from: number; to: number; migrate(doc: unknown): unknown };

const migrations: Migration[] = [
  // { from: 1, to: 2, migrate: v1_to_v2 },
];

function loadDocument(raw: unknown, fileVersion: number): Project {
  if (fileVersion > CURRENT_FORMAT_VERSION) throw new NewerFormatError(fileVersion);
  let doc = raw;
  for (const m of migrations.filter(m => m.from >= fileVersion)) doc = m.migrate(doc);
  return ProjectSchema.parse(doc);        // zod — validate only after migrating
}
```

### 4.2 The rules

1. **Version 1 and a working runner ship with the first save implementation**, before any release.
   Retrofitting migrations after real user files exist is the kind of pain that is entirely
   avoidable by spending an hour now. (Risk R10 in [architecture.md](architecture.md).)
2. **A shipped migration is immutable.** Never edit one; if it was wrong, write another after it.
3. **Never delete a migration.** The chain must reach back to version 1 forever.
4. **Every version bump commits a fixture.** `fixtures/format/v<N>.lcp`, a real file saved by that
   version, with a test that opens it and asserts the resulting document. That corpus is the only
   thing that proves the chain still works, and it costs one file per bump.
5. **Migrations run on raw JSON**, before zod validation. Validating first would reject old files by
   definition.
6. **A newer file is refused, not guessed at.** Opening `formatVersion` above `CURRENT` shows "This
   file was made with a newer version" rather than silently dropping the fields it does not
   recognise.

### 4.3 Unknown-field preservation

Within a known version, unknown properties on known objects are **preserved** through a load/save
cycle in an `_ext` bag rather than dropped. This means a file touched by a newer minor build is not
quietly damaged by an older one. Cheap to implement in the deserialiser, and it removes a whole
category of data-loss bug reports.

### 4.4 Migrations are not the only forward-compatibility tool

Because derived geometry is recomputed rather than stored, many changes that would be breaking in
another format are free here. Improving the offset algorithm, changing the flattening tolerance, or
fixing a corner-policy bug all improve existing files with **no migration at all** — the parameters
did not change, only their interpretation. This is a real, ongoing dividend of §3.3.

## 5. Validation on load

`zod` schemas mirror the domain types and run at the load boundary — the one place untrusted data
enters the system.

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

The split is by lifetime and portability: **a `.lcp` sent to another leatherworker must open
identically on their machine**. Anything that would change what they see belongs in the file;
anything that reflects *their* setup — their printer's calibration, their theme, their window
size — belongs in preferences.

## 7. Autosave and recovery

- Every 60 seconds, and on window blur, write the document to
  `~/.local/share/leathercad/recovery/<project-id>.lcp`.
- Write to a temporary file and `rename()` over the target. `rename` within a filesystem is atomic,
  so a crash mid-save cannot leave a truncated file. **The same applies to normal saves** — never
  write in place over the user's project.
- On startup, if a recovery file is newer than the project it shadows, offer to restore it.
- Delete the recovery file on clean save and clean exit.

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
7. **Unknown-field preservation.** A document with extra properties survives a load/save cycle.
8. **Referential integrity.** A dangling `fromId` loads with a `BROKEN_DERIVATION` diagnostic rather
   than throwing.
