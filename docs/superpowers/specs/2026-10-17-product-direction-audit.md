# Product direction audit — the roadmap after 1.5

**Date:** 2026-10-17 · **Base:** `develop` at `ad7b59e` (U.4–U.16 and U.20 merged)
**Status:** Proposed for the maintainer's review. Nothing here is decided until it is accepted;
[`product-roadmap.md`](../../product-roadmap.md) §7 lists what needs deciding.

The evidence behind [`product-roadmap.md`](../../product-roadmap.md) and the changes made with it to
the roadmap's *Later*, the product spec and the supporting documents. It follows the
[pre-1.0 product audit](2026-09-23-pre-1.0-product-audit.md): every finding cites where it was
checked. The question is wider than that audit's:

> Which way should LeatherCAD grow after 1.5, so that it becomes the tool a leatherworker reaches
> for to design anything made of leather — easy on the first day, deep after years, and aware of
> what its geometry means?

Classes: **(1)** built and verified · **(2)** in progress · **(3)** planned and documented ·
**(4)** partly documented, or waiting on a decision · **(5)** new · **(6)** duplicated or
overlapping · **(7)** inconsistent across documents · **(8)** not recommended.

---

## 1. The state audited

- **Released:** v1.3.5 (2026-10-09), which carried U.1 to U.3.
- **1.5 on `develop`:** U.4 to U.16 and U.20 are merged (#78–#103). U.17 is open as #104, which also
  settles U.6's question of what runs add up to. U.18 and U.19 are not started. Q27, R8, R9 and R10
  are open in the same section, so the release gate refuses 1.5 today with seven items to go. The
  roadmap's ☐ on U.17 is right for `develop`; #104 changes it as it merges.
- **1.5's open decisions:** focus mode across a restart (U.5), preferences version 2 (U.10) and
  French Shift+`&` (U.11) are still marked *Not yet decided*.
- **Outside the project:** one open pull request from outside, a Russian translation (#87). The
  issue tracker holds the maintainer's and the nightly run's issues, none from a maker; Discussions
  are enabled and empty.
- **Kept clear of #104:** this change touches none of the lines #104 changes — the roadmap's 1.5
  section, `domain-model.md` §6.1, `file-format.md` §6 and `getting-started.md` — so either can merge
  first.

## 2. Every idea, where it stood, and what became of it

| Idea | Stood | Evidence | Decision | Now |
|---|---|---|---|---|
| Thickness and wrap compensation | (4), (7) | A fold stores `materialThicknessMm`; U.13 copies the maker's default into new folds; nothing reads it. The spec and domain model said "v1.1" | Keep, in steps, each checked on leather: a fold's allowance as a reading, then applied, then gussets along a seam. Where thickness lives is decided first | 9.1, *Leather has thickness* |
| Tracing from images | (3), (7) | `assets/` reserved in file-format §1 with role `trace-image`; `persist` writes no assets. The spec said "v1.1" | Keep; after SVG import, since it needs a format change and a raster layer | 9.2, *Bring patterns in* |
| Hardware library | (3), (7) | `hardwareType` is an enum; `punches.ts` holds sizes. The domain model, the spec and two code comments said "v1.1" | Keep, as the maker's own list like *My tools*, each placed piece keeping its dimensions | 9.3, *Hardware that fits* |
| Boolean operations, robust offsetting | (3), (7) | ADR 0008: written here. `geometry.md` §8 still said "Delegated to Clipper2"; the spec said booleans "share the Clipper dependency" | Keep as a geometry track alongside the milestones | 9.11, 9.5, *Robust shapes* |
| Seam pairing and hole-count parity | (3), (7) | `Seam` designed (domain-model §7); `SEAM_HOLE_COUNT_MISMATCH` named; the 1.0 audit called it "the one physically important check still missing". Docs said "v1.2" | Promote: the first candidate milestone | 9.6, *Pieces that fit* |
| Templates | (3), (6) | Domain-model §9 and file-format §8 (`.lcpart`); the sample opens untitled (`readSampleProject`); 8.8b moves parts the same way | Split: templates in *New project* (new), the part library (9.7), parameters to *Exploring* | 9.18, 9.7 |
| Nesting on a hide | (7) → (8) | *Later* 9.9; the 1.0 audit: "not a pattern editor's job"; the spec and the Sheets spec: "v2" | Not planned. Needs a hide's outline, flaws, grain and booleans; laser users nest in their CAM. The leather a project takes goes to 9.12 | *Not planned* |
| A general curve editor | (4) | *Also later*. Hidden dependency: analytic offsetting refuses cubics (geometry §6.2) | Keep, after curves that can be stitched | *Also later*, after 9.19 |
| Advanced dimensions | (3) | *Also later*; 4.10b in 1.6; Q15 open | Unchanged | 1.6, *Also later* |
| Grain direction | (3), (7) | *Also later*; the glossary said parts already "carry" it; 7.8 lifted the turning rule, with the arrow to turn with the piece (printing §5.5) | Keep; numbered with thickness, as material | 9.22 |
| Copy and paste of features | (4) | 8.8b names the domain question; duplicate-part re-pointing exists (4.3b) | Keep, before the library, which inserts the same way | 8.8b, *Start from something* |
| Stitch summary | (2) | U.17, #104 | 1.5 | U.17 |
| Thread estimate | (6), (7) | Three homes: domain-model §6.3 ("4–5 ×"), printing §12 ("4×"), R-14's reserved third line | One item, which decides the formula | 9.12 |
| Printing, calibration, export | (3) | 1.6: 7.5, 7.6c, 6.4, 7.2; R8 in 1.5 | Unchanged | 1.6 |
| A hole and thread report, a cutting list | (4) | printing §12 describes one; no roadmap item | Merged with the thread estimate | 9.12 |
| PNG at a stated DPI | (4) | printing §12 only | Left as an idea: no maker has asked, and the 1:1 PDF is the product | Not added |
| `.lcp.json` | (4) | file-format §8; not built, not on the roadmap | Recorded | *Also later* |
| Functional requirements and fit | (5) | Nothing in the model. The clear size inside an open stitch line is computable today | A first increment: one requirement on one kind of thing — what a pocket holds — stored as metadata. No requirements engine | 9.14 |
| SVG import | (5) | Only export exists (6.2). Units, Y flip, cubics, roles and unsupported elements all unaddressed | Candidate, after curves that can be stitched; a new package and an ADR for its parser | 9.20 |
| Problems explained | (5) | `problemText.ts` words what a problem *is*, not why it matters or what to do | Candidate; words only | 9.15 |
| Accepting a warning | (4) | Left out on purpose (validation-complete §9); `problemKey` was designed for it; Q4 open | Candidate, after Q4 | 9.16 |
| Fixes offered with a problem | (4) | "A command generated from a diagnostic and a genuinely new idea" (validation-complete §9); the store already previews and rolls back | Candidate; previewed, one undo step, never automatic | 9.17 |
| Hardware clearance | (1) with a defect | `holePoints` gives a hardware hole's centre to `OUTSIDE_PART` and `HOLE_TOO_CLOSE_TO_EDGE` (`validate.ts`), never its radius | Fix the rim as a 1.6 bug; then rim-based rules, then footprints | Q33, 9.23 |
| Hardware placed from an edge | (4) | The 4.7 design records it as an additive derivation; no roadmap item | Candidate | 9.24 |
| Seam alignment marks | (5) | Only a hand-drawn marking line with purpose `alignment`. The glossary's *registration mark* is about paper | Candidate, derived from a seam, printed rather than cut | 9.13 |
| Skiving | (4) | Marking purpose `skive`; the glossary: "a marking region (later)" | A band derived inward from an edge, printed; feeds thickness | 9.21 |
| Edge finishing | (8) as geometry | The glossary: "not modelled geometrically". A turned edge is an allowance, a fold and a skive band | No new concept | — |
| The beginner's path | (1) in part | *New project*, the sample, empty states (F.1), hints (U.11), the next step (U.17), no wizard by decision | Templates and explanations; still no wizard | 9.18, 9.15 |
| A community library or marketplace | (8) in the app | Files already open the same anywhere; no accounts by principle | Exploring, as files only | *Exploring*, *Not planned* |
| Comparing design variants | (8) for now | *Save as* covers it | Exploring | *Exploring* |
| Navigating large projects | (1) | U.5 folds, U.8's tree | Nothing new | — |
| A constraint solver | (3), conditional | 9.10: "only if real use proves the derivation graph insufficient" | Exploring | 9.10 |
| Printed text legibility | (7) | Domain-model §8.6 said it lands in 4.11; `INVARIANTS_WITHOUT_A_CODE` still says *Planned* | A finding | Q34 |
| Radius-aware corners; slot and diamond holes | (4), (7) | Domain-model §3.3, §6.1 *Later*; §10 said "v1.1"; not on the roadmap | Recorded | *Also later* |
| A notes field on a part | (7) | Domain-model §2 *Later* against the roadmap's *Not planned* and the 1.0 audit | Not planned, as decided at 1.0 | *Not planned* |
| Pieces placed as they are stacked | (5) | Nothing; the model holds no placement of a part (§2) | Exploring, after seams | *Exploring* |
| Laying out pieces on a hide by hand | (5) | — | Exploring, after tracing and grain | *Exploring* |
| An AI assistant | (8) | The brief, and ADR 0013's reported rules | Not for its own sake; rules first | *Not planned* |

## 3. Discrepancies

| # | What disagreed | Evidence | In this change |
|---|---|---|---|
| D1 | 3D "at least not before v3" against *Not planned: 3D* | product-spec §2; roadmap | A boundary in the spec; architecture R13 follows |
| D2 | The spec's *out of the MVP* table targets v1.1 to v3, and booleans "share the Clipper dependency" | product-spec §5; ADR 0008; the roadmap | The targets point into the roadmap; the Clipper line corrected |
| D3 | "Verified means a steel rule on paper, which is 7.7" | product-spec §5; roadmap M5 and R1 | Measured on Linux, R8 for the rest |
| D4 | "A Flatpak is 1.1"; "millimetres only" | product-spec §8; CHANGELOG 1.1.0; U.15 | A Flatpak since 1.1; units typed in cm or inches since U.15, stored and shown in mm |
| D5 | Version targets "v1.1" and "v1.2" for work that 1.1 to 1.3.5 did not carry | domain-model §3.4, §3.6, §4, §7, §8.6, §9, §10 | Roadmap ids instead |
| D6 | "Templates as copies — Later: 8.1" | domain-model §10; roadmap 9.7 "(was 8.1)" | 9.7 |
| D7 | A notes field *Later* against *Not planned* | domain-model §2; roadmap; 1.0 audit §2.9 | Not planned |
| D8 | "Shipped iron presets as document data" *Later*, against irons as application configuration | domain-model §2 against §6.2 and U.13 | Aligned with §6.2 |
| D9 | `TEXT_TOO_SMALL_TO_PRINT` "lands in 4.11" | domain-model §8.6; `codes.ts` | Marked planned; Q34 |
| D10 | `PARTS_OVERLAP_ON_SHEET` planned for "v1.2" | domain-model §8.6; the sheet plan packs every piece (7.4a, 7.8) | Retired from the plan |
| D11 | Grain "Parts carry a grain direction annotation" | glossary; no code | Not modelled yet, 9.22 |
| D12 | *Registration mark* described as crosshairs, corner marks and tile labels | glossary; printing §7 (7.2a's join lines and crosses) | Updated; *alignment mark* and *seam* added and told apart |
| D13 | Booleans "delegated to Clipper2" | geometry §8; ADR 0008 | Written here, with 9.11 |
| D14 | Guides described as persisted document objects | architecture §6.6; file-format §3.1 ("guides … are not in the format"); roadmap 3.10 | Marked designed, not built |
| D15 | Constraints and 3D "named as v3 in the product spec" | architecture R13 | Follows D1 |
| D16 | Taped pieces' remainder "7.2, 1.1" | printing §7; roadmap 1.6 | 1.6 |
| D17 | Thread at 4× and at 4–5× the seam | printing §12; domain-model §6.3 | 9.12 decides |
| D18 | Nesting in *Later*, "not a pattern editor's job" and "v2" | roadmap; 1.0 audit; product-spec §5; Sheets spec §11 | *Not planned* (the dated Sheets spec is left as written) |
| D19 | The hardware library "in v1.1" in code comments | `domain/src/feature.ts`, `renderer/src/punches.ts` | **Not changed:** code, for a code change |
| D20 | A hardware hole's clearance read from its centre | `validate.ts` `holePoints`; `validate.test.ts` treats a 4 mm rivet centred 1 mm in as only *too close* | Q33 |
| D21 | A dangling reference "loads with `BROKEN_DERIVATION`" against the loader refusing it, with the code retired | file-format §5, §9 item 8; domain-model §4.2, §8.6 | **Not changed:** outside this refresh |
| D22 | The domain "normalises contour winding" against "winding is not normalised" | geometry §6.4; domain-model §3.1 | **Not changed:** outside this refresh |
| D23 | The Y flip "in exactly two places" against `worldToScreen` and three users | architecture R6; CLAUDE.md invariant 2 | **Not changed:** outside this refresh |
| D24 | Module layout lists `boolean.ts`, `trim.ts`, `fillet.ts`, which do not exist | geometry §11 | **Not changed:** a layout sketch; 9.5 will settle it |
| D25 | The README's documentation table omits the product spec | README | Added, with the new overview |

## 4. What this change does not touch

- **1.5:** its section of the roadmap, its decisions, its plan and its requirements stay as they are,
  and nothing in 1.5 is marked done that is not.
- **Code:** none, including D19's comments.
- **`CLAUDE.md`:** already past its own ~150-line guideline
  ([`claude-code-setup.md`](../../claude-code-setup.md) §2), so the overview is listed in
  `claude-code-setup.md`'s table instead.
- **Records:** `history/` and the dated specs say what was true on their day, and stay so.

## 5. Checks

- **The release gate.** `tools/release-gate.sh`'s own reading of `roadmap.md` finds 1.5's section
  byte for byte as `develop` has it: the same seven open items, and no new mark.
- **The tests that read the docs.** `problems/audit.test.ts` and `problems.test.ts`, which read
  `domain-model.md` §8, pass (177 tests).
- **Links.** Every relative link and anchor in the repository's Markdown resolves, by a script that
  follows GitHub's heading rules — except one that was already broken and is outside this change:
  `superpowers/plans/2026-09-29-top-bar-and-settings.md` points at its design in the wrong folder.
- **Diagrams.** All six Mermaid diagrams in `product-roadmap.md` parse and render with Mermaid
  10.9.1 and 11.4.1, in the light and the dark theme, and read at GitHub's page width.
- **#104.** A three-way merge of `roadmap.md` and `domain-model.md` with #104's head (`89ee46d`)
  has no conflict, so either can merge first.
