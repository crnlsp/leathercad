# The diagnostic channel (slice 4.12a) — design

**Date:** 2026-09-15
**Status:** Accepted with the [Phase 4 reconciliation](2026-09-15-phase-4-reconciliation-design.md)
**Decisions:** [ADR 0013](../../adr/0013-invariants-are-enforced-rules-are-reported.md)
**Invariants delivered:** E1, E2 (as far as today's geometry can split), E3 typed, X1 and X3 explained
through one channel, X7, and X9 (new) (`domain-model.md` §8)

---

## Why this is second

Every later Phase 4 slice introduces an invariant, and ADR 0013 says each lands with its own
refusals and rules. They need somewhere to land that is not another string. Today there are seven
separate ways the code says something is wrong, and none of them can be counted, filtered, tested
by identity, or shown in more than the one place it was written for:

| Today | Shape | Read by |
|---|---|---|
| `derivationRefusal`, `followRefusal` | `string \| null` | commands, the *Follows* field |
| `graphProblems` | `{ featureId, code, message }` | the loader |
| `transformShape` | `Result<ParametricShape, string>` | `refusedTransforms` |
| `refusedTransforms` | `{ featureId, featureName, reason }` | select, rotate and scale tools |
| `drawTargetNotice` | `string \| null` | every draw tool |
| `ResolvedFeature` failure | `error: string`, from `RangeError` messages | property panel; `buildDisplayList` skips it |
| `StitchHoles.spacingWarning` | `boolean`, with its sentence written in React | stitch hole editor |

This slice replaces all seven with one model. It adds no new way to report anything.

## Acceptance criteria

Checkable by using the application:

1. A stitch line inset deeper than its outline can hold is listed in a **Problems** panel, with its
   part, its name and the reason. The status bar counts it.
2. Clicking that problem selects the stitch line; its property panel shows the same reason, from the
   same list.
3. The holes that follow the failed stitch line are listed once, as *could not be built because
   Stitch line failed*, not with a second copy of the inset's reason (E3).
4. A failed feature no longer vanishes: the geometry it was being built from is drawn as a dashed
   warning outline on the canvas (D4). Export and print are unchanged.
5. A hole set whose spacing drifts more than 25 % from its iron is a warning in the panel; runs whose
   spacings differ from each other by more than 5 % of the pitch are listed as info; a hole set with
   fewer than two holes is a warning.
6. An outline drawn as a figure of eight is an error: *the outline crosses itself*, marked on the
   canvas where it crosses.
7. An emptied part is listed as info.
8. Every refusal the app already explains says exactly what it said before: squashing a circle,
   dragging a stitch line on its own, drawing a fold line with nothing selected, re-pointing into a
   loop, and opening a file with a broken graph.
9. Fixing the cause removes the problem at once, and Undo brings it back.

## Four layers

The requirement is that the domain can say something precise without knowing how it will be shown,
and that every surface shows it the same way. So what a problem **is**, what the domain **knows**
about it, how it **reads**, and **where** it is shown are four separate things, in four places, with
dependencies pointing one way.

```
  information       problem.ts    ProblemFacts (the codes) · Problem · Diagnostic · ProblemLocation
      ▲
  identity          codes.ts      category · invariant · default severity, per code
      ▲
  presentation      messages.ts   describeProblem · problemTitle        (headless, one catalogue)
      ▲
  surfaces          ui            status notice · Problems panel · property panel · canvas markers
```

The set of codes is the key set of the facts map, so `codes.ts` registers what `problem.ts`
declares and both `codes.ts` and `messages.ts` are typed over it. A code with no registration, or no
message, does not compile — and nothing imports in the other direction, so there is no cycle.

### 1. Identity — `domain/src/problems/codes.ts`

Every code is registered once:

```ts
interface CodeInfo {
  readonly category: 'structural' | 'interaction' | 'outcome' | 'rule';
  readonly protects: InvariantId;              // 'S2', 'E3', 'DR4', 'X9' …
  readonly severity: Severity;                 // the default; a rule may raise or lower it
}

export const PROBLEM_CODES: { readonly [K in ProblemCode]: CodeInfo };
```

The registry is typed over every code, so a code with no registration does not compile. A code is a
stable string: it is what tests assert, what a future file of suppressed warnings would store, and
what 4.12's audit test checks against `domain-model.md` §8. Renaming one is a breaking change.

`category` is ADR 0013's three categories, with refusals split by what they protect:

- **structural**: S1–S10, refused by commands and the loader, never a diagnostic;
- **interaction**: X1–X9, refused at a gesture, never a diagnostic;
- **outcome**: E1–E4, how a feature fails to resolve, always a diagnostic;
- **rule**: DR1–DR6, legal and probably wrong, always a diagnostic, never blocking.

### 2. Domain information — `domain/src/problems/problem.ts`

```ts
interface ProblemFacts {
  SOURCE_MISSING: { featureId: FeatureId; featureName: string };
  OFFSET_COLLAPSED: { featureId: FeatureId; featureName: string; distanceMm: Mm; side: 'inward' | 'outward' };
  HOLE_SPACING_DEVIATION: { featureId: FeatureId; featureName: string; achievedMm: Mm; pitchMm: Mm };
  // … one entry per code
}

type ProblemCode = keyof ProblemFacts;
type Problem = { [K in ProblemCode]: { readonly code: K; readonly facts: ProblemFacts[K] } }[ProblemCode];
```

- **Facts, not sentences.** A problem carries the numbers and names a message needs and nothing
  else. A test asserts `{ code: 'OFFSET_COLLAPSED', facts: { distanceMm: 60 } }`, which survives
  every rewording.
- **Names are captured when the problem is found.** A feature's name is the user's data, not
  presentation, and capturing it means a message needs no project to look it up in.
- **`problemKey(problem)`** is `code`, plus the subject's id, plus a qualifier for codes that can
  occur twice on one subject. It is the identity of an occurrence: React keys, the "did re-pointing
  introduce a new problem" diff in `followRefusal`, and later a suppression list.
- **`sameProblem(a, b)`** compares code and facts, so a tool asked on every pointer move for the same
  refusal does not make React re-render sixty times a second.

A **diagnostic** is a problem found in the design, placed:

```ts
interface Diagnostic {
  readonly problem: Problem;
  readonly severity: Severity;
  readonly partId: PartId;
  readonly featureId?: FeatureId;               // absent for a part-level problem, like EMPTY_PART
  readonly related: readonly FeatureId[];       // SOURCE_FAILED names the root
  readonly location?: ProblemLocation;
}

type ProblemLocation =
  | { readonly kind: 'points'; readonly points: readonly Vec2[] }   // where an outline crosses itself
  | { readonly kind: 'path'; readonly path: Path };                  // what a failed feature was built from
```

`location` is domain information, "where on the design", in millimetres. Whether it becomes a dashed
line, a dot, or a zoom target is a surface's decision.

### 3. Presentation — `domain/src/problems/messages.ts`

```ts
function describeProblem(problem: Problem): string;   // the sentence
function problemTitle(code: ProblemCode): string;     // a short label for a list
```

One catalogue, typed over every code, so a code with no message does not compile. It is headless
and pure. It lives in `domain` because the loader in `persist` and the tools' notices need the same
sentences as the React panels, and `domain` is the lowest package all of them share.

Being in `domain` must not make it convenient for other domain modules to write sentences. A
**dependency-cruiser rule** allows only `problems/index.ts` (and its own test) to import
`messages.ts`. `graph.ts`, `evaluate.ts`, `transformShape.ts` and the rules can produce facts and
cannot reach for English.

Every existing sentence moves into the catalogue **word for word**. The refusal tests change from
matching text to asserting codes and facts; the few E2E tests that read a notice on screen still
match the same words, which is the proof nothing visible changed.

### 4. Surfaces — the application

All of them read problems through `describeProblem`, and all diagnostics through one list:

| Surface | Reads | Shows |
|---|---|---|
| Status bar notice | a tool's `notice(): Problem \| null` | the refusal, while it is true |
| Status bar count | `diagnose(project)` | `N problems`, when there are any |
| Problems panel | `diagnose(project)` | severity, title, part, feature, sentence; a click selects |
| Property panel | `diagnose(project)` filtered to the feature | the same rows, replacing `resolved.error` and the spacing sentence |
| Canvas | `diagnose(project)` locations | failed features' source geometry dashed in the warning colour; self-intersections as dots |
| Loader | `graphProblems(project)` | `InvalidProjectFileError` built from `describeProblem` |

Nothing in `editor` or the app composes a sentence about a design problem. Undo labels, dialog copy
and byte-level file errors stay where they are: they are not problems with the design (see *Outside
the channel*).

## Where problems come from

### Refusals

The queries keep their names and their order of checks, and return a problem instead of a string:

| Query | Returns | Codes |
|---|---|---|
| `derivationRefusal(project, feature)` | `Problem \| null` | `SOURCE_MISSING`, `FOLLOWS_ITSELF`, `WOULD_LOOP`, `DERIVATION_INCOMPATIBLE` |
| `followRefusal(project, id, sourceId)` | `Problem \| null` | `FEATURE_MISSING`, `NOT_DERIVED`, the above, and any graph problem the re-point would introduce |
| `graphProblems(project)` | `Problem[]` | `DUPLICATE_ID`, `SOURCE_MISSING`, `CYCLE`, `DERIVATION_INCOMPATIBLE` |
| `transformShape(shape, m)` | `Result<ParametricShape, Problem>` | `TRANSFORM_FLATTENS`, `WOULD_BECOME_ELLIPSE`, `WOULD_SHEAR` |
| `refusedTransforms(project, ids, m)` | `{ featureId, problem }[]` | the above, and `DERIVED_MOVED_ALONE` |
| `drawTargetNotice(ctx)` | `Problem \| null` | `NO_TARGET_PART`, `TARGET_SPANS_PARTS` |

`DERIVATION_INCOMPATIBLE` carries a `rule` fact naming the row of the compatibility table that
refused it (`'holes-need-hole-set'`, `'allowance-needs-closed-line'`, …). One structural invariant
(S4) is one code; the row is a fact.

The commands still share these checks and still return the document unchanged when they refuse. No
command gains a return value or a side channel: a refusal is visible as "the document did not
change", and the reason is the query. That is the existing X1 contract, now typed.

### Evaluation outcomes

`ResolvedFeature`'s failure becomes typed:

```ts
| { ok: false; feature: Feature; problem: Problem; location?: ProblemLocation }
| { ok: true; feature; role; path; holes?; notes?: readonly Problem[] }
```

Inside `evaluate.ts` a private `Failure` carries a problem up the stack instead of a `RangeError`
carrying a sentence.

| Code | When | Location |
|---|---|---|
| `PARAMETER_INVALID` | A shape, distance or pitch is not a usable number: non-finite, negative radius, zero pitch. Checked by the domain before geometry is asked, so the message names the parameter the user typed | none |
| `OFFSET_COLLAPSED` | `offsetPath` returns nothing | the run it followed |
| `OFFSET_UNSUPPORTED` | The followed path holds a curve the analytic offset cannot take | the run it followed |
| `OFFSET_SPLIT` | The offset came back in more than one piece; the largest is kept | the kept piece |
| `ANCHOR_MISSING` | A partial run names a corner the source does not have | the source |
| `SOURCE_FAILED` | What this follows failed; its `related` names what it follows, which carries its own diagnostic | none |
| `CYCLE` | Defensive; S3 makes it unreachable | none |
| `GEOMETRY_FAILED` | Any other throw from geometry. The fallback that keeps E1 true: carries the raw detail, and its presence in a test is a gap to close with a specific code | none |

**`OFFSET_SPLIT` is unreachable today, and this design says so.** `offsetPath` is Tier 1: it returns
no pieces or exactly one, and refuses a self-intersecting result rather than splitting it. The
branch that keeps the largest piece and reports the rest is written and tested as a pure function
over synthetic pieces, so E2 holds the day Tier 2 offsetting returns more than one. No test claims
to produce a split through `evaluate`.

`StitchHoles.spacingWarning` is removed. Distribution reports what it achieved; judging it is a rule.

### Design rules — `validate(resolved)`

Pure, over the resolved project. Each rule names its invariant in the registry.

| Code | Severity | Rule | Protects |
|---|---|---|---|
| `CONTOUR_SELF_INTERSECTS` | error | A cut contour crosses itself (`selfIntersections`); location is the crossings | DR3 |
| `HOLE_SPACING_DEVIATION` | warning | Achieved spacing differs from the iron's pitch by more than 25 % | DR4 |
| `HOLE_SPACING_UNEVEN` | info | With more than one run, the runs' spacings differ from each other by more than 5 % of the pitch | DR4 |
| `HOLE_COUNT_TOO_LOW` | warning | A hole set has fewer than two holes | DR4 |
| `EMPTY_PART` | info | A part has no features | DR6 |

`HOLE_SPACING_UNEVEN` compares runs **with each other** and `HOLE_SPACING_DEVIATION` compares the set
with the **iron**, so they report different things and can both apply. `HOLE_COUNT_TOO_LOW` is
counted over the set rather than per run: with *hole at corner*, a run shorter than a pitch
legitimately contributes one hole, because its other end is the corner the previous run already
punched.

### One list — `diagnose(project)`

```ts
function diagnose(project: Project): readonly Diagnostic[];
```

Outcomes from `evaluate`, then rules from `validate`, in part order and then feature order.
Memoised on the project object, the same identity trick as `evaluate`, so every surface that asks
during one render gets the same array (X7). Self-intersection results are memoised on the path
object, because an unchanged outline is the same path between revisions.

## New invariant

**X9. A transform never silently demotes a shape's representation.** A circle stays a circle, or the
transform is refused and says why. `transformShape` has enforced this since slice 3.7 without it
being catalogued; it is recorded now because its refusals join the channel.

## Outside the channel

- **Undo labels.** They name an action that succeeded.
- **Dialog copy.** The delete dialog explains a choice, not a problem.
- **File errors below the graph**: not a ZIP, no manifest, a newer format, a schema violation. They
  describe bytes, not a design, and name a JSON path rather than a feature. The loader's **graph**
  check does go through the channel.
- **Programmer errors.** `invariant` still throws; a thrown error is a bug to fix, a problem is a
  state to render (`core/result.ts`).

## Deliberately not here

- **`OUTSIDE_PART` and `HOLE_TOO_CLOSE_TO_EDGE`.** Both need material-relative containment (D6) and
  a distance-to-path query geometry does not have yet. They land with cut-outs in 4.3, which is where
  "inside the part" first gets its real meaning.
- **Zoom-to-problem, part and feature badges, the export warning, the audit test.** Slice 4.12.
- **Suppressing a warning.** `problemKey` is designed so a suppression list can store it; nothing
  stores one yet.

## Tests

- **Identity.** Every code has a registration, an invariant id in the catalogue's form, and a
  message: a test builds one sample problem per code from a map typed over every code, and describes
  each.
- **Refusal paths, explicitly.** Each refusal query is tested per code with its facts, and each
  command that shares the query is tested to return the document **by identity** when refusing. The
  loader refuses each graph problem with the catalogue sentence.
- **Wording preserved.** The catalogue test pins the pre-existing sentences.
- **Outcomes.** One test per outcome code through `evaluate`, except `OFFSET_SPLIT` (a unit test of
  the keep-largest step) and `CYCLE` (unreachable through commands; built directly). E3: a failed
  root yields exactly one root problem and `SOURCE_FAILED` below it.
- **Rules.** Each rule at, just under and just over its threshold. Property tests: `validate` is
  deterministic, reports nothing for a plain rectangle chain at any size, and a feature listed as
  failed is never also listed by a rule.
- **Surfaces.** Display list tests for the warning outline; E2E for criteria 1–4 and 8.
- **Budget.** `diagnose` on the three-thousand-hole strap stays inside the existing 50 ms.
