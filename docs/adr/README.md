# Architecture decision records

Why each decision was made, so it is not reopened by accident. An ADR is written **before** the
change it decides, in the same pull request: a new dependency, a new edge between packages, or a
reversal of anything below.

**To write one,** copy the headings of [0001](0001-record-architecture-decisions.md) — Context,
Decision, Consequences, Alternatives rejected — take the next number, and add a row here. An
accepted ADR's decision is not rewritten: a new one supersedes or amends it and says so, as
[0019](0019-print-from-the-app.md) does for 0007 in its *Amends* line. Some carry a dated note of
an amendment in place — 0007, 0010, 0011 and 0013 — so read an ADR to its end.

| ADR | Decision |
|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions |
| [0002](0002-electron-over-tauri.md) | Electron over Tauri |
| [0003](0003-typescript-geometry-core.md) | TypeScript geometry core, not Rust |
| [0004](0004-pnpm-workspaces.md) | pnpm workspaces |
| [0005](0005-typescript-5-9.md) | Pin TypeScript to 5.9.3 |
| [0006](0006-lcp-file-format-dependencies.md) | fflate and zod for the .lcp file format |
| [0007](0007-pdf-lib-for-export.md) | pdf-lib for PDF export |
| [0008](0008-no-clipper-binding.md) | No Clipper binding |
| [0009](0009-explicit-resolution-when-deleting-a-source.md) | Explicit resolution when deleting a feature others depend on |
| [0010](0010-anchors-address-geometry.md) | Anchors are the only way to address a place on a feature |
| [0011](0011-one-vendored-typeface-outlined-on-paper.md) | One vendored typeface, laid out once, outlined on paper |
| [0012](0012-mirror-is-a-derivation.md) | Mirror is a derivation; placement stays in feature geometry |
| [0013](0013-invariants-are-enforced-rules-are-reported.md) | Structural invariants are enforced; design rules are reported |
| [0014](0014-electron-builder-and-release-please.md) | electron-builder for packaging, release-please for releases |
| [0015](0015-local-logs-and-crash-dumps.md) | A local log and local crash dumps, nothing uploaded |
| [0016](0016-quality-tooling.md) | Quality tooling: knip, the hooks rules, axe, and Stryker |
| [0017](0017-lucide-for-generic-icons.md) | Lucide for generic icons; LeatherCAD's own marks drawn here |
| [0018](0018-interface-language.md) | The interface's words: a catalogue per language, and no words below the app |
| [0019](0019-print-from-the-app.md) | Print from the app: pdf.js for the preview, the CUPS client with scaling off |
