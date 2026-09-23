# Validation complete (slice 4.12) — design

**Date:** 2026-09-19
**Status:** Accepted (2026-09-19), with the three decisions in §11.
**Completes:** [4.12a's diagnostic channel](2026-09-15-diagnostic-channel-design.md),
[ADR 0013](../../adr/0013-invariants-are-enforced-rules-are-reported.md)
**Invariants touched:** X7 finally holds across every surface; no new invariant, no new problem code

---

## 1. What is left, and what this slice must not become

4.12a built the model: one `Problem` carrying **facts, never a sentence**, one `diagnose()` list, a
problems panel, and failed features drawn rather than vanishing. Every slice since has added codes to
it. What is missing is **reach**: the list exists, and three of the six surfaces the reconciliation
promised do not read it.

So this slice is wiring, deliberately. The temptation it must resist is inventing a second,
UI-shaped idea of what is wrong — a severity the panel computes itself, a "blocking" flag the export
adds, a message the badge shortens. Every one of those would be the seven string channels 4.12a
deleted, growing back one at a time.

**The rule for the whole slice: the UI reads `Diagnostic`, and adds nothing to it that the domain
could have said.**

## 2. Ambiguities in the reconciliation, made explicit

Asked for at review, and there are four. Each is a place where the spec and the built model disagree
or the spec is silent, and where coding without deciding would have invented behaviour.

### 2.1 `at?: Vec2` versus `location?: ProblemLocation` — **the spec is out of date**

§3.7 sketches:

```ts
at?: Vec2;    // zoom-to-problem; falls back to the feature's bounds
```

but 4.12a built something better and the sketch was never updated:

```ts
location?: ProblemLocation;   // { kind: 'points'; points } | { kind: 'path'; path }
```

A single point cannot say "these three holes" or "this whole stitch line", and 4.3a's review
specifically made the hole rules carry *which holes*. **`location` is authoritative; `at` is
retired**, and §3.7 is corrected in the same commit.

### 2.2 "Refuses nothing. Warns that errors exist" — **but which errors?**

§3.7's export row says export refuses nothing and warns. It does not say what the warning counts, and
"failed features are left out" is a separate fact from "rules were broken". §5 decides both, and the
decision is that **the policy lives in the domain**, not in the export dialog.

### 2.3 Badges: "a count badge on each part and each feature row" — **of what?**

A count of everything, or of errors? Does a part's badge include its features' problems? §4 decides:
a part's badge counts everything inside it, and severity colours it by the worst it contains — so a
part with nine infos never looks like a part with one error.

### 2.4 Validation is "memoised per part, on the same identity keys as evaluation"

It is not, and should not be. 4.12a found that `evaluate` builds a fresh `ResolvedProject` every call,
so `diagnose` memoises on the **project object** instead — recorded in the roadmap as a gotcha. The
sentence in §3.7 describes a design that was tried and rejected; it is corrected rather than
implemented.

## 3. Zoom-to-problem

### What is authoritative

**`Diagnostic.location` when it is there; the feature's evaluated bounds when it is not; the part's
bounds when the diagnostic is about a part.** In that order, and never a fourth guess.

| Problem kind | What it carries today | Where zoom goes |
|---|---|---|
| `CONTOUR_SELF_INTERSECTS` | `points` — the crossings | the crossings |
| `OUTSIDE_PART`, `HOLE_TOO_CLOSE_TO_EDGE` (holes) | `points` — the offending holes | those holes |
| `OUTSIDE_PART` (a line), `CUT_OUT_OUTSIDE_PART` | `path` — the feature | the feature |
| `OFFSET_COLLAPSED`, `OFFSET_UNSUPPORTED`, `ANCHOR_MISSING` | `path` — what it was built **from** | the source geometry, which is where the fix is |
| `SOURCE_FAILED`, `PARAMETER_INVALID` | nothing | the feature's bounds |
| `EMPTY_PART`, `PART_HAS_NO_OUTER_CONTOUR` | nothing, and no `featureId` | the part's bounds |

The fourth row is worth noticing: **a failed feature has no geometry of its own**, so its diagnostic
already points at its source. That is not a fallback, it is the right answer — a stitch line that
could not be built is fixed by editing the outline.

### Navigation is deterministic, including for derived features

The user's concern, and the answer is that **nothing is searched for at click time**. The target is
computed from the diagnostic the panel is already displaying, against the same `ResolvedProject`
every surface is reading. Two rules make it deterministic:

1. **Zoom frames a bounding box**, never "the nearest thing". A `points` location frames the points
   with a margin; a `path` location frames its bbox; a fallback frames the feature's or part's bbox.
2. **Selection follows `featureId` if there is one, and the part otherwise** — 4.3b gave the store
   both. A diagnostic about a *derived* feature selects that feature, not its source, even though
   the zoom may be showing the source's geometry. The panel says which feature it is about; changing
   what gets selected to match the zoom would make clicking the same row twice select two different
   things.

That split — **select the subject, frame the evidence** — is the one genuinely new idea in this
slice, and it is what keeps a derived feature's diagnostic honest.

### The plumbing it needs

The viewport lives inside `CanvasHost` and nothing outside can move it. Zoom-to-problem needs a way
in: an imperative handle (`frame(bounds)`) exposed by `CanvasHost` and called by the problems panel.

**This is not the deferred viewport question.** [Reconciliation §10](2026-09-15-phase-4-reconciliation-design.md)
defers *whether a command should move the view* — duplicate, mirror, paste. This is a **navigation
gesture**: the maker clicked a problem and asked to be taken to it. Answering it does not answer the
other, and the handle it adds is what that question will eventually need.

## 4. Badges

**What is shown:** a count, coloured by the worst severity it contains.

| Where | Counts | Colour |
|---|---|---|
| **Problems panel header** | every diagnostic in the project | worst in the project |
| **Part row** | every diagnostic in that part, including its features' | worst in that part |
| **Feature row** | diagnostics whose `featureId` is that feature | worst on that feature |

**How it maps to the model:** `severity` comes from the `Diagnostic`, which got it from
`PROBLEM_CODES[code].severity` or a per-occurrence override (4.3a's line-versus-hole case). The badge
derives **one** thing — the worst of a set — and that is a fold over `severity`, not a new judgement.
It never reads a code to decide how to look.

A part with nine infos and a part with one error must not look the same, which is why the colour is
the maximum rather than the count being split three ways. Counting is what a badge is for; ranking is
what colour is for.

**Not shown:** no badge where the count is zero. An empty badge is chrome that teaches nothing.

## 5. The export warning

### Which problems block, and where the policy lives

**Nothing blocks.** The reconciliation is right about this and the reason is worth stating: a pattern
with a warning on it is still a pattern someone may want on paper, and a tool that refuses to print
because a hole is 1.4 mm from an edge will be worked around within a day — by exporting from a copy
with the hole moved, which is worse than printing the warning.

So export **warns and proceeds**, and the warning says two different things that must not be
conflated:

1. **Rules broken** — the diagnostic list, summarised by severity. "3 errors, 2 warnings."
2. **Features left out** — `scene.ts` already skips `!entry.ok`, so a failed feature is *silently
   absent from the paper today*. That is the more serious of the two, and it is not a diagnostic
   count: it is a fact about what the export contains.

**The policy lives in the domain**, as a pure query beside `diagnose`:

```ts
export interface ExportReadiness {
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  /** Features that will not be on the paper, because they did not resolve. */
  readonly omitted: readonly { featureId: FeatureId; featureName: string; partName: string }[];
}
export function exportReadiness(project: Project): ExportReadiness;
```

The dialog renders it. It does not compute it, does not decide what counts as serious, and cannot
drift from what `scene.ts` actually does — because `omitted` is derived from the same `ok` flag
`scene.ts` filters on.

**Deliberately not here:** a setting to block export on errors, per-code suppression, or "export
anyway" as a second confirmation. All three are policy this product has not needed yet.

## 6. Staleness, derived features and references

The user's concern, and the honest answer is that **most of it is already true, and one part of it
needs a test rather than code.**

- **Diagnostics are computed from the current evaluated geometry**, always: `diagnose(project)` calls
  `evaluate(project)` and memoises on the **project object**. A new project object — which every
  command produces — is a cache miss. There is no way to observe a diagnostic from a previous
  geometry, because there is no stored diagnostic to observe.
- **Derived and referenced features re-evaluate correctly** because 4.8b and 4.10a made the cache key
  include referenced geometry (`refsFrom`). A measurement whose anchor moved, or a counterpart whose
  fold moved, is rebuilt and re-validated.
- **The gap is proof, not behaviour.** Nothing currently tests that a diagnostic *disappears* when the
  geometry that caused it is fixed, or that one *appears* on a derived feature when its source
  changes. §8 adds those, including for a measurement and a fold-linked mirror — the two features
  whose validity depends on something they are not built from.

One real consequence to state: **a diagnostic's identity is not stable across edits.** There is no
diagnostic id, and two runs produce equal-by-value entries rather than the same object. That is fine
for a list rendered from scratch, and it means the panel must key its rows by content
(`code` + `featureId` + index), not by identity. Worth saying because the opposite assumption is easy
to make and fails silently as a React key.

## 7. The invariant audit test

### What is mechanically checked

The audit exists to stop the **catalogue** and the **code** drifting apart. It checks relationships,
never restates rules:

1. **Every code names an invariant** in `domain-model.md` §8's form — built in 4.12a.
2. **Every code's category matches its family** — S→structural, X→interaction, E→outcome,
   DR→rule — built in 4.12a.
3. **New:** every invariant §8 lists has at least one code, **or** is on
   `INVARIANTS_WITHOUT_A_CODE` with a reason. Ten are: S8, S9, S10, DR5, X2, X5, X6, X7, X8 and X10
   — held up by a schema, by the layering, or by there being no field a violation could live in.
   (S7 was named here as an example and is **wrong**: `FEATURE_LOCKED` arrived with 4.3b. The audit
   catches exactly that, refusing an exemption for an invariant that has a code.)
4. **Replaced.** "Every structural code is refused by a command *and* by the loader" is not
   uniformly true and should not be forced: a `DUPLICATE_ID` cannot come from a command, because
   commands do not invent ids, and a `MIRROR_OUTLINE_ACROSS_FOLD` cannot come from a file, because
   the loader's structural scan has no gesture to refuse. Made honest instead of mechanical: §8.6's
   refusal table names, per code, where it is refused, and the audit holds the registry and that
   table to each other in both directions.
5. **Kept, generalised, and made order-independent** (§11.1): every code — not only a rule — must be
   named by a test that is not one of the catalogue's own. Two are exempt by name and by reason
   (`OFFSET_SPLIT`, `GEOMETRY_FAILED`), both unreachable today, and the audit fails if a test ever
   does reach one and the excuse is left behind.

**What it found on the way in**, which is the argument for having it: `MEASURE_NEEDS_ANCHOR` was
produced by the measure tool and named by no unit test at all — the tool had E2E coverage and no
other. `packages/editor/src/tools/measureTool.test.ts` is the audit's first catch.

### How it avoids duplicating the domain rules

This is the part worth getting right, and the answer is that **the audit never asserts what a rule
means.** It asserts that a rule *exists*, is *categorised* consistently, and is *exercised*. The
difference:

- **Duplicating:** "a hole within 1.5 mm of an edge produces `HOLE_TOO_CLOSE_TO_EDGE`". That is
  `validate.test.ts`'s job, and writing it twice means changing it in two places — and the audit
  copy would be the one that quietly rots.
- **Auditing:** "`HOLE_TOO_CLOSE_TO_EDGE` is a `rule` protecting `DR2`, and some test produces it."

Point 5 needed a way to know a code is tested. **Settled at review as a source scan** (§11.1): the
audit reads every `*.test.ts` under `packages/` and asks whether each code is named in one. Nothing
is registered at run time, so no test depends on another having run, and a code that no test
mentions at all is caught — which a registry populated by running tests could never do, since a code
nothing produces is a code nothing registers.

**Where the invariant list itself lives.** `domain-model.md` §8 is prose, and a test cannot read
prose. The audit checks the **code's** self-description (`PROBLEM_CODES`), and a separate, short
markdown check confirms every invariant id used in the code appears in §8's tables. That keeps one
source of truth — the document — and one mechanical link to it, without parsing English.

## 8. Acceptance criteria

1. **Clicking a diagnostic frames its evidence and selects its subject.** Points frame the points, a
   path its bounds, and a diagnostic with neither frames the feature or the part. A diagnostic about
   a derived feature selects *that* feature.
2. **Badges** on the problems panel header, each part row and each feature row: a count, coloured by
   the worst severity there, and absent at zero.
3. **Export warns and proceeds**, saying how many problems there are and **naming any feature left
   off the paper** because it did not resolve.
4. **`exportReadiness` is a pure domain query**, and the dialog renders it without judgement of its
   own.
5. **The audit test** holds points 1–5 of §7, statically: registry and documentation agree in both
   directions, every invariant is accounted for, and every code is exercised by a test that is not
   the catalogue's own.
6. **Diagnostics are never stale**: tests prove one disappears when its cause is fixed and appears on
   a derived feature when its source changes — including a measurement and a fold-linked mirror.
7. **The reconciliation's four ambiguities** (§2) are corrected in the documents, not worked around.

## 9. Deliberately not here

- **Blocking export**, suppression, or per-code settings (§5).
- **A diagnostic id** or stable identity across edits (§6). Nothing needs one; the panel keys by
  content.
- **Quick fixes** — "move this hole 0.2 mm" — which would be a command generated from a diagnostic and
  a genuinely new idea.
- **Live validation while dragging.** `diagnose` is memoised per project object and a drag previews
  many; this slice does not change when validation runs.
- **Rules.** No new codes. Every rule this product has arrived with the slice that made its state
  reachable, which was the point of ADR 0013's ordering.

## 10. Tests

- **Zoom target**, per location kind: points, path, feature fallback, part fallback — as a pure
  function, so the choosing is testable without a canvas.
- **Selection**: a diagnostic about a derived feature selects that feature, not its source; a
  part-level diagnostic selects the part.
- **Badges**: counts roll up from features to parts; colour is the worst severity, not the commonest;
  zero renders nothing.
- **`exportReadiness`**: counts by severity; `omitted` lists exactly the features `scene.ts` skips —
  asserted against `scene.ts`'s own output, not against a re-implementation.
- **Staleness**: fix the cause, the diagnostic goes; move a measurement's anchor, its diagnostic
  follows; move a mirror's fold, the counterpart's diagnostics follow.
- **The audit**, §7.
- **E2E**: a panel with a hole too near the edge — click the problem, see the view move and the
  feature selected; fix it, see the badge clear; export with a failed feature and read the warning
  naming it.

## 11. Settled at review

1. **The registry in `codes.ts` is authoritative**, and the audit verifies **registry completeness**
   and **explicit test coverage** — without depending on the order tests run in. So no
   runtime-populated set: coverage is checked by reading the test sources for each code, which is
   mechanical, order-independent, and catches a code no test mentions at all.
2. **`CanvasHost.frame(bounds)`** is added as the **canvas-owned viewport API**. A diagnostic supplies
   bounds; UI code never touches a transform.
3. **The export warning counts omitted features separately** from validation problems that are still
   exported, and **export stays non-blocking**.

## 12. Superseded open questions

1. **The test-populated code registry** (§7 point 5) is the only new machinery in the slice. It is
   honest — it observes what the tests actually produced — but it makes one test depend on the others
   having run. The alternative is a hand-maintained list of "codes we have tests for", which drifts.
   I prefer the registry and would like it confirmed.
2. **`CanvasHost` gains an imperative handle** (§3). Small, but it is the first time anything outside
   the canvas moves the viewport, and it is the plumbing the deferred framing question will want. I
   think navigation justifies it and commands still do not; worth confirming that reading.
3. **Export naming omitted features** (§5) is slightly more than "warns that errors exist". I think it
   is the more important half — a feature silently missing from paper is how a pattern gets cut wrong
   — but it is an addition to the sketched scope.
