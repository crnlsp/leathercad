# Resource limits (PERF-012)

A small parameter file can ask for hundreds of thousands of holes or sheets. A ZIP can claim an
arbitrary expanded size, including a size smaller than its real output. Refuse excessive work
before allocating it, with `ResourceLimitError` from `core`: a resource id, requested count and
limit. The app supplies the words. An operation either succeeds whole, at the existing precision,
or is refused; it never drops holes, truncates a file or scales a pattern to fit a budget.

## The ceilings

`packages/core/src/resources.ts` owns these values. They are operational work ceilings, not
geometry tolerances, new schema fields or a format-version change.

| Resource | Limit | Why this ceiling and where it applies |
|---|---|---|
| Archive input | 32 MiB | Bounds the bytes the ZIP parser processes. Checked on the supplied byte array, before reading its directory; it does not bound an OS file read that has already produced that array. The audit's forty traced parts occupy about 470 KiB compressed. |
| Expanded archive | 32 MiB total | Bounds text/JSON preparation and schema cloning. Directory sizes are checked before decompression; actual emitted bytes are checked as well, so false size headers cannot bypass the ceiling. |
| Archive entries | 1,024 | The current format uses three; leaves room for future assets without accepting an unbounded entry walk. Both directory and streamed local entries are counted. Unused entries are not inflated. |
| JSON values | 500,000 | Counts containers and values, including unknown metadata, before migrations and schema validation. Traversal is iterative and bounds its pending stack before adding children. |
| Parts, features and guides | 10,000 total | Bounds project indexing and graph preparation, including empty parts and hidden features. The audit's bag has forty parts and about 120 features. |
| Path segments | 250,000 total | Checked on stored paths before indexing or measuring; also counts resolved paths across an evaluation, including derived/cached paths. The 40 × 500-point workload has 20,000 stored segments and more resolved segments because stitching and its holes also carry paths; it must remain accepted. |
| Text characters | 20,000 total | Bounds typography preparation from project/part/feature names and labels, including hidden features. Counted as UTF-16 code units, conservatively for surrogate pairs. |
| Holes | 250,000 per evaluation | About eighty times the 5.8 m strap's count. Every run's exact count is planned before placing the first point of a set; shared corner candidates count as work too. Previously resolved sets, mirrors and cache hits count against the remaining project allowance. A rejected evaluation returns no partial pattern. |
| Sheets | 1,000 per plan | About thirty times the 33-sheet strap. Counts all parts, tiled sheets and assembly maps. Layout candidates are compared before checking the chosen plan; tile arrays are built only afterwards. |

These limits bound requests and allocations; they are not a promise that every combination below
them is fast, nor a bound on total process memory, retained history or all filesystem I/O.
There is no new dependency and no approximation or sampling of pattern geometry.

## Boundaries and preservation of work

- **Files:** ZIP directory checks allocate no entry content. Required entries expand in 1 KiB
  compressed chunks; DEFLATE's expansion per chunk is bounded (about 1032×), and actual output is
  checked before retaining it. The joined entry is allocated only once the output fits. Unknown
  entries are skipped. `readManifest` uses the same reader, inflating only the manifest.
- **Projects:** JSON size is checked before migration/schema work, and stored project counts
  before graph checks. Evaluation and distribution enforce their own work limits, including when
  used headlessly. A resource refusal escapes evaluation rather than becoming a failed feature
  that an exporter could omit.
- **Editing/open/reload:** the app gives `DocumentStore` its existing sheet-plan derivation as an
  admission check. A new document or preview is checked before the store publishes it. A refused
  edit keeps the last accepted document, selection, undo and redo; a refused reload also keeps
  the saved state. This adds no upward package dependency. Accepted derivations warm the same
  cache that the window reads, rather than building a second print plan.
- **Other paper choices:** a project can fit the budget on A3 but exceed it on A5. The paper picker
  keeps that choice visible, marked unavailable, without attempting its tile allocation. A normal
  choice still shows its exact count. Changing paper is checked like any other command.
- **Templates/recovery:** template evaluation stays inside the picker's existing load-error
  boundary. If admitting recovered work fails, its dialog shows the reason and keeps both its
  offer and the recovery file; it does not acknowledge or clear the only copy. A load-stage
  resource refusal is not marked corrupt either. Dismissing either resource refusal keeps its
  recovery file through a clean exit, for a later attempt.

## Compatibility

The schemas, migrations, stored parameters and the meaning of every accepted file are unchanged.
All shipped format fixtures still open. Accepted projects generate the same saved bytes, geometry
and vector output. Unknown metadata within the budgets still round-trips.

A previously schema-valid project can exceed an operational ceiling. It is then refused with a
resource error, not labelled corrupt by the loader and not opened partially. Its file and any
project already open remain untouched. This is an explicit capacity limit replacing an allocation
that could exhaust the process, not a migration of the user's file. The loader's historical
outcomes remain valid for ordinary malformed files and newer formats; its fuzzer now also expects
the explicit resource refusal.

## Reproduction and regression checks

`node --expose-gc tools/perf-resources.mjs [--root <before-tree>]` bundles the chosen tree's
production functions. Three samples each ask for a 32 m square at 0.5 mm pitch, a 200 m strip's
A4 tiles, and a small ZIP whose document claims 64 MiB. These are bounded reproductions: the old
implementation creates 256,000 holes and 1,112 tiles, and accepts the ZIP after trusting its size;
the guarded implementation refuses all three. No unbounded ZIP bomb is executed.

The harness also hashes saved `.lcp`, PDF, SVG and DXF bytes for the wallet, print test, 5.8 m strap
and 500-point traced outline. Compare `acceptedOutput` between trees. The historical measurements
and command results are in [the backlog](performance-backlog.md#perf-012).

`pnpm check` includes deterministic guards for advertised and false ZIP sizes, a shrunk byte-flip
counterexample, aggregate/cached hole counts, segment and feature budgets, aggregate tiles and
assembly maps, distribution planning properties and refusal without changes to history. The
Electron scenarios in `e2e/resource-limits.spec.ts` cover an oversized open, size edit and recovery.
No ordinary geometry/export snapshot is updated to accommodate a limit.
