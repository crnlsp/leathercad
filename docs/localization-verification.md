# U.26 localization audit and verification

Prepared 2026-11-04 on `develop` at `e51e1c4`, on branch
`feat/u26-interface-localization`. This is evidence for code review, not a claim of native-speaker
approval or physical print verification.
French was added in a follow-up to commit `242aefc` on the same PR, following the same policy.
Spanish and the template-picker review fixes were added on 2026-11-05 on the same PR.

## Baseline and English audit

The starting catalogue contained **1,211 leaves, 1,154 logical messages and 57 plural families**.
The families cover the start screen, tabs, menus, tools and hints, keyboard shortcuts, Settings,
file errors, recovery/deletion, printing/calibration/exports, Parts/Properties, diagnostics,
history, templates, guides and alignment. The inventory is reproducible from `en.json` and
`pnpm locales:report`. The original localization/JSX tests passed: 3 files, 33 tests.

There are 55 top-level groups and 116 distinct placeholder names. Representative families:

| Key | Forms | Placeholders and context |
|---|---|---|
| `parts.rowHoles` | English `_one`, `_other` | `count`: hole count beside a named feature |
| `printPreview.printSheets` | English `_one`, `_other` | `count`: sheets sent to the printer |
| `recovery.detail` | Scalar | `name`, `when`: recovery copy, original file unchanged |
| `file.newerNamed` | Scalar | `version`, `format`, `current`: compatibility error and recovery action |
| `problems.OFFSET_COLLAPSED.outward` | Scalar | `distance`: allowance outside a stitch line |
| `settings.language.option` | Scalar | `own`, `here`: a language's own name and its localized name |

Polish and Russian add `_few` and `_many` to each translated plural family; German keeps the
English categories. French adds `_many` for exact integer millions and uses `_one` for zero and
fractions below two. All placeholders remain identifiers, regardless of interface language.

The existing JSON v4/typed-key/Intl/React-context architecture was retained. Live preference
updates already reached renderer and main-process translators; production previously registered
only English and development discovered unregistered files. Formatting already used Intl for
placeholder numbers, dates and lists; geometric fields/readouts use the documented house format.

English changes were limited to demonstrable problems:

| Area | Correction and reason |
|---|---|
| Stitching | *A seam* in the drawing refusal and allowance hint described a single stitch line. Use *stitch line*; reserve *seam* for mating runs. The low-hole-count message now says *stitching*. |
| Draw mode | *Stitch line* and *Stitch line + allowance* match feature names and the glossary. The After the outline help follows these labels. |
| Corner-radius errors | State that the **radius** exceeds half a dimension or available side length; replace the unclear “height leaves it”. Keep the offered corrected value and Enter action. |
| Print failure | “Could not accept the print job” replaces “did not take the job”, retaining printer and reason. |
| Settings | The tool-rail breakpoint is 1280 px, not the stated 1200 px. |
| Grammar | *Flip horizontally/vertically* are actions; clarify double-clicking an empty area of the board. |

The [glossary](glossary.md) and [translation style guide](localization.md) keep intentional
distinctions: pitch/achieved spacing, Flip/linked Mirror, save/export, duplicate/clipboard copy,
pattern/reusable template, leather alignment/paper registration and physical sheet/PDF page.
No identifiers, diagnostic codes, existing saved values, geometry or export algorithms were renamed.
The shared catalogue flattener now preserves every JSON key, including `__proto__`, so an unknown
key cannot silently disappear before structural validation; a failing-first regression covers it.
The final data-boundary audit also reproduced a localized default Save as filename
(`Bez tytułu.lcp` instead of `Untitled.lcp`) and fixed it by explicitly using English for that
suggestion. The native-dialog regression checks it in every registered language. An unnamed tab still
uses its existing translated UI placeholder; changing language never writes that placeholder into
project data.

## Catalogues and coverage

All five translations contain every current English message. Polish and Russian have 1,325
leaves each, including four CLDR forms per plural; German has 1,211 leaves and French and Spanish
have 1,268 each. Production registers English, Polski, Deutsch, Русский, Français and Español
explicitly, independently of coverage.

| Locale | Translated | Uncounted / missing | Total logical messages | Coverage |
|---|---:|---:|---:|---:|
| en | 1,154 | 0 | 1,154 | 100.0 % |
| pl | 1,110 | 44 | 1,154 | 96.2 % |
| de | 1,099 | 55 | 1,154 | 95.2 % |
| ru | 1,114 | 40 | 1,154 | 96.5 % |
| fr | 1,099 | 55 | 1,154 | 95.2 % |
| es | 1,117 | 37 | 1,154 | 96.8 % |

The uncounted entries are English matches, ignoring whitespace, including keycaps, PDF/SVG/DXF, symbols,
placeholder-only layouts, shared German words such as *Name* and *Text*, shared French words such
as *Guide*, *Rectangle* and *Application*, and shared *Logo*.
They are intentionally not counted as successful translations. There are **no absent message
families or structural errors** in these catalogues. `pnpm locales:report` lists every uncounted
key. Counts can change as English evolves and are never a release gate.
The French follow-up reproduced a reporting gap where a nonbreaking-space-only edit counted as
a translation. Coverage now ignores whitespace differences, with a failing-first regression. The
report also prints each language's required plural forms, making the French `_many` requirement
visible to future contributors. The previous locales' coverage counts did not change.

Future feature PRs need only add English. A missing scalar message falls back to English. A
missing or incomplete plural family uses the whole English family with English plural rules;
numbers remain formatted in the selected UI locale. Validation rejects partial translated families
and permits whole missing families. Regression tests reproduced both the old partial-family error
and Russian “21 hole” fallback before fixing them.

For the maintainer's Polish review, run:

```bash
pnpm locales:report --review pl > /tmp/leathercad-polish-review.md
```

## Independent references and tools actually used

German, Russian, French and Spanish were prepared with AI assistance and remain open to native-speaker corrections.
Russian reuses compatible translations contributed by **F1ystar** in
[PR #87](https://github.com/crnlsp/leathercad/pull/87), head
`27b72f5df653ee9056618b68cac52514f7a80b71`. Its discussion and review findings were read: the
missing Russian `_few`/`_many` forms and missing production registration are addressed. Existing
wording was compared against both that PR's English and current English; stale descriptions of
transforms, conversion to a drawn path and shortcuts were updated. Attribution is retained in
the README and translation guide. No native/professional approval is claimed.

The requested external services were investigated through their official interfaces:

- [DeepL API keys](https://support.deepl.com/hc/en-us/articles/360020695820-API-key-for-DeepL-API):
  authenticated API access requires a key; none was available. **No DeepL translation was run.**
- [Google Cloud Translation setup](https://docs.cloud.google.com/translate/docs/setup): an enabled
  project and credentials are required; none was available. **No Google comparison was run.**
- [LanguageTool public API rules](https://dev.languagetool.org/public-http-api.html): automated
  requests are prohibited on the public endpoint. No permitted authenticated or local service was
  available. **No LanguageTool check was run.**

An independent spelling check **was run locally with Hunspell** over the original Polish, German
and Russian catalogues, with
placeholders removed. Public dictionaries were downloaded to a temporary directory from
[LibreOffice/dictionaries](https://github.com/LibreOffice/dictionaries/tree/4f1df64b2e8e14751aa7c2205d170ca016071315),
commit `4f1df64b2e8e14751aa7c2205d170ca016071315`: `pl_PL/pl_PL`, `de/de_DE_frami`, `ru_RU/ru_RU`.
No project data or catalogue text was sent to an external service; no dictionary or spelling
dependency was added to the application. There were 15 distinct Polish, 65 German and 48 Russian
flagged tokens. They were reviewed as acronyms, keycaps, product names or specialist/compound
words such as *Polilinia*, *Prickeisen*, *Nahtlinie*, *Картхолдер* and *скругляет*. Dictionary
flags do not establish semantic correctness; absence of a flag does not establish grammar quality.

Accessible independent terminology references were checked:

- [CraftPoint's Polish tool catalogue](https://craft-point.com/collections/wybijaki-do-skory)
  supports *wybijak* and *rozstaw zębów* for the tool's nominal pitch.
- [Pet Hardware's German Prickeisen guide](https://www.pethardware.com/de/prickeisen/)
  supports *Prickeisen* and *Stichabstand*. The UI explicitly uses *Nennabstand* versus
  *Istabstand* to preserve LeatherCAD's nominal/achieved distinction. This page was available
  through search excerpts; a direct page fetch failed.
- [Groomix's Russian tool catalogue](https://groomix.ru/craftools/proboyniki_str2_5mm.html)
  supports *строчный пробойник* and *шаг пробойника*.
- [Graphisoft's Russian guide-line documentation](https://help.graphisoft.com/AC/20/RUS/AC20Help/02_Interaction/02_Interaction-51.htm)
  supports *направляющие*. Search excerpts were accessible; a direct page fetch failed.

These are terminology references, not machine-translation comparisons or native-language reviews.

For French, [Unicode CLDR's language plural rules](https://www.unicode.org/cldr/charts/49/supplemental/language_plural_rules.html#fr)
were checked against the actual Node/Electron `Intl.PluralRules` results. French has `one`, `many`
and `other`; English's singular category cannot be reused for French zero/fractions. Every French
family includes `_many`, with context-sensitive *de/d’* before nouns at exact millions. Dedicated
tests cover 0, 1, 0.5, 1.5, 2, 21, 1,000,000, 2,000,000, 1,000,001 and 1,000,000.5, plus missing
families and a translated family lacking `_many`. Hardcoded “this feature”/“once” singular messages
were expressed with the count in French so zero does not silently become one.
[Larousse's own usage entry](https://www.larousse.fr/dictionnaires/francais/million/51492) also
confirms that *de/d’* remains before a noun when an exact million is written in digits, and is
omitted before a unit symbol. This was checked separately from the CLDR category definitions.

[Deco Cuir's own catalogue](https://www.decocuir.com/collections/griffes-frapper-points-couture-main-cuir)
confirmed *griffe à frapper* and *entraxe*. The French UI uses *pas nominal* versus *espacement réel*,
*patron* versus *modèle*, and *Retourner* versus linked *Symétrie liée*. No English wording or
persisted identifiers changed in this follow-up.

The French catalogue was checked locally with Hunspell and the official LibreOffice
`fr_FR/dictionaries/fr.aff` / `fr.dic` at the same pinned dictionary revision above. Of 1,311
distinct tokens, 16 were flagged: key abbreviations/acronyms/product names, *Polyligne/polyligne*
and *réaffichage*. These were reviewed in context; no confirmed spelling error remained. This is
not grammar or native-speaker approval. No text was sent to an external translation service.
`pnpm locales:report --review fr` produces the full 1,268-row side-by-side French review.
Conventional French key labels (*Maj*, *Entrée*, *Échap*, *Suppr*, etc.) were checked against
[Microsoft's French keyboard documentation](https://support.microsoft.com/fr-fr/accessibility/windows/keyboard-shortcuts-in-windows).
They change displayed labels only; key codes, saved bindings and shortcut behavior stay unchanged.

## Contextual semantic checks

| High-risk family | Reviewed result |
|---|---|
| Pitch and spacing | Nominal and achieved measurements remain distinct in editor fields, hints, deviation warnings and the stitching status lines. The status lines and spacing problem titles were first written with a bare *rozstaw / Abstand / шаг*; the review follow-up below aligned them with the canonical table. |
| Seam versus stitch line | A single path uses *linia szycia / Nahtlinie / линия строчки / ligne de couture*; allowance remains *zapas na szew / Nahtzugabe / припуск на шов / marge de couture*. |
| Mirror and Flip | Linked counterparts have distinct labels/help. Russian legacy short labels were made explicit where both operations appear together. |
| Delete, trash and recovery | Permanent loss of unsaved changes, recoverable file trash, removing a recent entry, and recovery-copy expiry remain distinct. Negations and cancellation actions were retained. |
| Conversion and scale | Russian descriptions now include the current option to convert shapes to a drawn path and scale a whole piece evenly. The original PR predates that behavior. |
| Printing and calibration | Actual size/100 %, no fit/shrink and printer-specific correction remain explicit. Russian Actual size wording is consistent across export and calibration instructions. |
| Placeholders and plurals | Structure checks cover all entries. Polish/Russian counts 0, 1, 2, 5, 11, 21, 22 and fractions have dedicated runtime tests; 21 deliberately differs between Polish and Russian. |
| File/export errors | Preserve the failed operation, unchanged current work and detailed reason. Resource limits are worded without assuming the grammatical case of an interpolated noun. |

Polish is prepared for the maintainer's personal review, which has not yet taken place. German,
Russian and French also need further native-speaker review for idiom and specialized craft usage.

## UI, platform and print boundaries

Verification uses the real production Electron build on Linux in the existing pinned
Playwright/Poppler container. Native file/printing boundaries use the existing test fakes. No
physical printer is used. The automated multilingual suite covers switching through all five
languages, native Save as dialog titles, production registry contents, each translation across
a restart, Linux system-language resolution, recovery, unchanged loaded project data after Save
as, and representative start/template/editor/settings/export/print/unsaved workflows at
1440 × 900 and 860 × 600 for the editor, start/templates, recovery and main dialogs.
The suite saves 124 representative screenshots, including 31 French captures alongside the earlier workflow captures;
screenshots are attached to test results for inspection.

The vendored Regular, Medium and SemiBold UI fonts were inspected with fontTools: all distinct
letters used in each catalogue are present (63 Polish, 58 German, 104 Russian and 62 French including Latin
letters in names and placeholders). This does **not** change the separate Latin
glyph outlines used to draw printed patterns. PDF captions, tape labels, generated data names,
default filenames and user-entered project data keep their documented behavior.
Unnamed tabs retain their translated UI placeholder until named. Cyrillic document labels can
still trigger the missing-glyph diagnostic and print as boxes. UI translation is not full PDF
content localization. No physical accuracy claim is made.

The expanded-English development preview is generated from the source and preserves placeholders
and plural keys. The actual `electron-vite dev` server was driven through local CDP: Design and
all six Settings sections were captured at emulated 1440 × 900 and 860 × 600 viewports, with no
horizontal overflow. The 14 screenshots were inspected; production was rebuilt afterward.
The production test asserts that it is not offered; production bundles were also
searched to confirm the preview and structural-checking code are removed by tree shaking.

The first multilingual axe scans exposed and prompted fixes for low-contrast start/template
metadata, the template sort button's accessible name and a pointer-only pin button nested inside
a listbox option. A localized Parts row name used an Intl conjunction not visible in the row;
its visual sequence now uses punctuation, with a dedicated regression. Natural-language lists
elsewhere still use Intl. At the minimum width the six full drawing-mode labels did not fit
in German/Russian. Below 1200 px they are now a selector with every full label; from 1200 px the
six marked buttons remain. Hints still fit by priority, and more may fit when the selector frees
space. Dialog heading levels now start at h2 and preserve their typography, so collapsing the
side panels does not leave an h1-to-h3 accessibility skip.

Extending the start/template tests to the minimum window exposed an additional keyboard issue:
the template's details scroll area was not focusable. It is now a named, focusable region; arrow
keys scroll its text without changing the selected template. The regression exercises Arrow Down,
End and Home, as well as the axe scan, in all four translations.

The French follow-up additionally checks the calibration editor and saved correction in every
translated locale at both window sizes: decimal-comma input, positive/negative percentage
adjustments, accessibility and screenshots. Context inspection caught French wording that called
these percentage adjustments a factor; it now describes corrections. This changes only interface
wording, not calibration math or print scale. The new keyboard scenario also reproduced lost focus
after saving calibration: Escape no longer closed Print Preview. Focus now returns to the
calibration button after saving or cancelling, with explicit regressions in each translated locale.
The full calibration labels now stack above their inputs so long translations have the pane's
width instead of wrapping word by word in the Properties column width.
The old system-fallback test also assumed French
would remain unsupported; it now uses `qaa`, a reserved private-use test locale, so adding real
languages cannot invalidate that regression.

Windows/macOS, real OS file dialogs, a physical printer, screen-reader usability and native-speaker
review remain unverified. These are review limitations, not coverage requirements on future PRs.

## Results before the Spanish follow-up

| Command / check | Final result |
|---|---|
| `pnpm test locales` | **24 passed**; all five files structurally valid |
| `pnpm test locales i18n untranslated partsTree` | **94 passed** across 4 files |
| `pnpm check` | **Passed**: TypeScript, lint, formatting, dependency rules, knip, 28 tooling tests, 3,862 unit/property tests across 232 files, 6 performance tests |
| `pnpm build` | **Passed**; all five registered languages included |
| Full production Electron E2E suite | **360 passed** in the pinned Playwright/Poppler container |
| Multilingual production scenarios | **17 passed**, including minimum-window start/templates/recovery, calibration and keyboard focus |
| `pnpm test:visual` | **5 passed**, without updating references in the final run |
| `pnpm locales:report` | Deterministic counts above; **no structural errors**, informational exit status |
| `pnpm locales:report --review pl` | Produced the complete side-by-side review: **1,325 rows** |
| `pnpm locales:report --review fr` | Produced the complete side-by-side review: **1,268 rows** |
| Production bundle inspection | No `en-XA`, expanded-preview label or structural-validator diagnostic strings in main/renderer bundles |
| `git diff --check` and architecture/invariant review | Passed; no new package edges, dependencies, lower-layer changes, migration edits or geometry golden changes |

The follow-up full check's pure-layer coverage was **98.00 % lines / 93.96 % branches**, above the existing
90 % / 85 % thresholds. No fast-check counterexample remained. The only changed visual reference
is the empty window, reflecting the justified English draw-mode and help text changes; its diff,
actual screenshot and replacement were inspected. The other four references remain unchanged.
After the final French wording/key-label and calibration-label layout edits, the production
build was rebuilt and the 17 multilingual scenarios and five visual comparisons were rerun.
The unsupported-language preference regression also passed separately with the reserved `qaa`
locale. No additional reference images were changed for French.

The E2E suite is the same one `pnpm test:e2e` runs. The production build was made separately,
then the existing Poppler container supplied the pinned display/fonts/PDF tools:

```bash
pnpm build
docker run --rm --init --ipc=host --user 1000:1000 \
  --volume "$PWD:$PWD" --workdir "$PWD" --env HOME=/tmp \
  leathercad-e2e-poppler:1.64.1 \
  xvfb-run --auto-servernum --server-args='-screen 0 2560x1440x24' \
  node_modules/.bin/playwright test
```

The implementation is ready for code and maintainer review. Polish review and further
German/Russian/French/Spanish native-speaker feedback remain welcome; the platform and print limitations above
remain explicit. No translation coverage threshold was introduced, and no automatic merge is part
of this work.

## Spanish and template-picker review follow-up — 2026-11-05

Spanish is registered as **Español (`es`)**, with every current English logical message and
all 57 plural families: 1,268 leaves. Its CLDR forms are `one`, `many` and `other`.
Runtime regressions cover 0, 1, 0.5, 1.5, 2, 21, exact millions, a million plus one and a
fractional million, as well as whole-English fallback for absent families or a missing `_many`.
The validator also rejects a partial Spanish family. English remains authoritative, coverage
remains informational and no runtime architecture or dependency changed.

The catalogue was prepared with AI assistance; no native-speaker approval or external
translation/spelling-service check is claimed for Spanish. Terminology and displayed key labels
are documented in the translation guide, including nominal pitch versus achieved spacing,
pattern versus reusable template, and unlinked flipping versus linked mirroring.
`pnpm locales:report --review es` produces the complete 1,268-row English/Spanish review.
All 58 distinct alphabetic characters in the catalogue (including keys) were checked with
fontTools against the vendored Regular, Medium and SemiBold UI fonts; none are missing.

Failing-first Electron regressions reproduced the three review findings:

- Enter in the focusable details region opened a template; Delete removed a user template.
  Both now leave the selection and picker intact. Escape still closes it, while the list
  retains Enter, Delete and Undo. The existing details-scroll regressions still cover arrows,
  End and Home in every translated language.
- Clicking row padding did not select it. Click and double-click handlers now cover the full
  highlighted row; the sibling pin button stops both events and leaves selection independent.
- The German sort name read `Sortieren Name (A–Z)` rather than the existing translated
  `Sortierung: Name (A–Z)`. Both visible text and accessible name now use `sortChosen` with
  its sort placeholder, preserving locale punctuation and placeholder order.

All six production languages now exercise every drawing mode at 1199, 1200, 1201 and 1280 px.
Tests verify selector/button visibility, selection, full button visibility, overflow and axe.
Spanish start/templates, editor, Settings, export, printing/calibration, unsaved changes and
recovery also pass at 1440 × 900 and 860 × 600, with persistence, Linux system detection,
native-dialog titles and unchanged saved project data. Screenshots of Spanish controls on
both sides of 1200 px, minimum-size templates, Language settings and calibration were inspected.
The targeted run found no accessibility violations; human screen-reader verification and
Windows/macOS manual checks remain outside this Linux verification.

| Check | Follow-up result |
|---|---|
| `pnpm test locales i18n untranslated` | **89 passed** across 3 files |
| `pnpm test locales i18n untranslated partsTree` | **108 passed** across 4 files |
| `pnpm check` | **Passed**: all static checks, 28 tooling tests, 3,876 unit/property tests across 232 files and 6 performance tests |
| Pure-layer coverage | **98.00 % lines / 94.06 % branches**; no geometry golden changes or fast-check counterexamples |
| `pnpm build` | **Passed**, all six registered languages included |
| Targeted Electron scenarios | **37 passed**: 27 multilingual/responsive, 5 accessibility and 5 template-interaction scenarios |
| Full production Electron E2E suite | **375 passed** in the pinned Playwright/Poppler container, without retries |
| Final rebuilt Spanish Electron workflows | **5 passed**, after the final four wording adjustments |
| `pnpm locales:report` | Spanish **1,117 / 1,154 (96.8 %)**; 37 shared English labels/layouts uncounted, no absent messages or structural errors |
| `pnpm locales:report --review es` | Complete **1,268-row** side-by-side review generated |

No new package edges, persistence changes, geometry changes or visual reference updates were
introduced. The existing English fallback and non-blocking coverage guarantees remain covered.
After that full run, four Spanish phrases were adjusted to avoid gender/number agreement with
dynamic subjects. Production was rebuilt and all five Spanish-focused scenarios passed again;
no behavior changed.

## Review follow-up — 2026-11-06

| Finding | Fix |
|---|---|
| Polish, German and Russian showed `\\` in the invalid-filename message, where English, French and Spanish show `\` | Corrected; `checkCatalogue` now fails a message whose backslash count differs from English |
| A placeholder written `{{ sort }}` passed the check, though the template picker and Settings split messages on the exact `{{sort}}`, `{{link}}` and `{{keys}}` | `checkCatalogue` now reports spacing inside braces as a malformed placeholder |
| Stitching status lines and the spacing problem titles used a bare *rozstaw / Abstand / шаг*, which in Russian reads as the pitch being squeezed | Aligned with the canonical *rozstaw rzeczywisty / Istabstand / фактический шаг*; pitch hints in Russian now say *номинальный шаг* |
| A fractional number in a message took the language's decimal comma, so German read *3.92 mm, Nennabstand 3.85 mm* beside *um 1,8 % vergrößert* | `t()` groups whole numbers as the language does and writes fractions in the house format, as ADR 0018 says |

Coverage figures are unchanged: these were corrections, not new translations.
