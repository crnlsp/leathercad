# Unknown-field preservation (the rest of slice 5.2) — design

**Date:** 2026-09-23
**Status:** Proposed with the slice's pull request.
**Row:** [roadmap](../../roadmap.md) Phase 5, slice 5.2 · [file-format.md](../../file-format.md) §4.3,
§5 item 7

---

## 1. What is left of 5.2

The roadmap lists two things still to add before 5.2 counts toward **M4**:

- **The committed `fixtures/format/v1.lcp` corpus.** It already exists, and it has grown to
  `v1`–`v9`, one real file per format version. `fixture.test.ts` opens each one through the
  migration chain. That part of the roadmap note is stale, and it is corrected here.
- **Unknown-field preservation**, "so a file touched by a newer build is not quietly damaged by an
  older one". This is the work.

## 2. The defect

`ProjectSchema` is built from `z.object`, and zod **strips** keys it does not know. Suppose a newer
build writes an optional field this build has never heard of: a grain direction on a part, a note
on the project, a new parameter on an iron. Opening that file here and saving it deletes the field
without a word. Saving is all it takes; the maker need not edit anything.

## 3. The mechanism: loose objects, not an `_ext` bag

`file-format.md` §4.3 sketched preservation "in an `_ext` bag". This slice keeps the promise and
changes the mechanism. **Every object in `ProjectSchema` becomes a zod 4 `looseObject`.** Unknown
keys stay on the object they were found on, the app carries them untouched, and `stableJson` writes
them back.

Why not the bag:

| | `_ext` bag | Loose objects |
|---|---|---|
| Load | Walk the raw and the parsed trees together and move each unknown key into a bag | The schema keeps them |
| Save | Walk the tree and flatten every bag back into its object | `stableJson` writes them as they are |
| Domain types | An `_ext?` field on every object type, which nothing in the domain reads | Unchanged |
| Edits | Kept wherever a command copies an object (`{ ...feature, name }`) | The same |
| Visible in the types | Yes, if every type declares it | No |

The behaviour is identical, including under edits. The bag costs a tree walk in each direction and
an optional field on dozens of domain types that no domain code would read. Its one advantage is
visibility in the types. What stands in for that here:
- nothing in the app reads a key it does not know;
- a test pins preservation at every level of the document;
- `file-format.md` says where unknown fields live.

`file-format.md` §4.3 is updated to describe the mechanism that is built.

**Hostile keys.** A file can say `"__proto__": {…}`. zod 4's loose objects neither keep it nor
honour it: the parsed object's prototype stays `Object.prototype`, so a planted `frozenFrom` or
`locked` cannot be inherited (checked, and tested). Every *known* key is validated exactly as
before, so nothing the loader refused before is let through.

## 4. What is preserved, and when

- **Open, then save, with no edits:** every unknown key, at every level. If the file came from the
  app's stable serialiser, the bytes come out identical.
- **After an edit:** unknown keys are kept on every object the edit copies. Every command copies the
  project, its settings, its parts and its features (`{ ...feature, name }`), so a newer build's
  field on a part or a feature survives renaming, hiding, locking, moving and the rest. An object
  that an edit **rebuilds** keeps nothing unknown. Examples are a shape the maker retyped or a
  source a delete froze. Its known values changed together, and this build cannot tell whether a
  field it has never seen still applies.
- **Numbers inside unknown fields** are written to six decimals, like every number in the file.
- **The manifest is not preserved.** It describes the file and the writer, and it is written fresh
  on every save by design.
- **Migrations** run on raw JSON before the schema. A migration that rebuilds an object drops that
  object's unknown keys. That only affects files from an older version, which a newer build of that
  same version would have had to write.

This does not weaken invariant 4. The app still computes nothing it persists; it only returns what
it was given.

It is **not a format version**. A document without unknown keys is written exactly as before.

## 5. Acceptance criteria

1. A current-version file with unknown properties on the project, its settings, a part, a feature,
   a source, a shape and a derivation opens without complaint. Saving it with no edits writes every
   one back, byte-identical to the input.
2. Renaming a part and hiding, locking and renaming a feature keep the unknown properties on the
   project, the part and the feature.
3. Unknown properties change nothing that is drawn, measured or validated.
4. A `__proto__` key in a file is ignored and cannot change a feature's properties.
5. Everything the loader refused before is still refused.
6. The roadmap's 5.2 entry is complete and its stale corpus note is corrected. `file-format.md` §4.3
   and §5 item 7 describe what is built.

## 6. Tests

- **Persist, property:** from the current-version fixture, add a generated unknown key at a random
  object anywhere in the document. Loading and saving keeps it at the same place, byte for byte.
- **Persist, by example:**
  - every level named in criterion 1;
  - the same geometry evaluated with and without the unknown keys;
  - a `__proto__` key with a planted `frozenFrom` and `locked`;
  - a known field that is still invalid alongside unknown keys, still refused.
- **Desktop, where the loader and the commands meet:** open, apply rename, hide and lock commands,
  save, and the unknown keys are still there. `apps/desktop` is the one package that imports both
  `persist` and `document`.
- **Fuzz:** `lcp.fuzz.test.ts` keeps passing. Its contract is unchanged.
