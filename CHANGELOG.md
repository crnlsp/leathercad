# Changelog

Every change a maker can notice, newest first. Written by
[release-please](https://github.com/googleapis/release-please) from the commit titles on `main`
([how to write one](CONTRIBUTING.md#commits-and-pull-requests)). What is merged but not released
yet is listed in the open
[release pull request](https://github.com/crnlsp/leathercad/pulls?q=is%3Apr+is%3Aopen+label%3A%22autorelease%3A+pending%22).
Downloads are on the [releases page](https://github.com/crnlsp/leathercad/releases).

## [1.6.0](https://github.com/crnlsp/leathercad/compare/leathercad-v1.5.0...leathercad-v1.6.0) (2026-11-02)


### Features

* **desktop:** a save or an export says it happened, and an opened project fades in ([#141](https://github.com/crnlsp/leathercad/issues/141)) ([1089943](https://github.com/crnlsp/leathercad/commit/108994376bbff94b260436f5895aaf6159ea2ced))
* **desktop:** LeatherCAD's own icons — a familiar outline with a leatherworker's detail ([#133](https://github.com/crnlsp/leathercad/issues/133)) ([6d21f4e](https://github.com/crnlsp/leathercad/commit/6d21f4ec191176b13bd7b4633e2e9d2a9260017a))
* **desktop:** place guides and align or distribute pieces (3.10) ([#129](https://github.com/crnlsp/leathercad/issues/129)) ([70c53b0](https://github.com/crnlsp/leathercad/commit/70c53b0981a68a0902102d6ce0ca795b3e9f8913))
* **desktop:** several projects in one window, each in a tab, and new projects from templates ([#132](https://github.com/crnlsp/leathercad/issues/132)) ([030b815](https://github.com/crnlsp/leathercad/commit/030b8153a5bedd0dc79bd219c1b0503f70364ef8))
* **desktop:** the app says when a new version is released, and links to it (8.9) ([#124](https://github.com/crnlsp/leathercad/issues/124)) ([25c237e](https://github.com/crnlsp/leathercad/commit/25c237e43e410c394e33750367f59663d3ae4883))
* dimensions drawn like drafting, and a piece's overall size (4.10b, Q15) ([#147](https://github.com/crnlsp/leathercad/issues/147)) ([731afd7](https://github.com/crnlsp/leathercad/commit/731afd7e9defcfb2fadcf4490aa1d4b88ad22919))
* **document:** convert a circle, arc or rectangle to a drawn path (3.12) ([#139](https://github.com/crnlsp/leathercad/issues/139)) ([6521654](https://github.com/crnlsp/leathercad/commit/6521654daca751fc8c44e21011440d9e5412fff5))
* **domain:** a row of holes along any marking line (4.14) ([#138](https://github.com/crnlsp/leathercad/issues/138)) ([8c4bc00](https://github.com/crnlsp/leathercad/commit/8c4bc00c86f0ce916880a789c10a5f27528a88a8))
* **export:** export a laser cut, a stitch guide or the whole template, choosing its layers (6.4) ([#155](https://github.com/crnlsp/leathercad/issues/155)) ([d86b3b2](https://github.com/crnlsp/leathercad/commit/d86b3b2e64af706454d22657ae06d36b0c7ed1cc))
* **export:** taped sheets say which sheet joins each edge, and a part taped into a grid prints a map (7.2) ([#154](https://github.com/crnlsp/leathercad/issues/154)) ([c632824](https://github.com/crnlsp/leathercad/commit/c632824a521666d1a9e86122509d0bbaa8ce24e3))
* **print:** calibrate a printer that prints a little large or small, and print to it corrected (7.5) ([#156](https://github.com/crnlsp/leathercad/issues/156)) ([b03e779](https://github.com/crnlsp/leathercad/commit/b03e77999d1bb46247c62e709523f21d3385117e))


### Bug Fixes

* **desktop:** a copy saved before a crash survives reopening the window on macOS ([#116](https://github.com/crnlsp/leathercad/issues/116)) ([c43967a](https://github.com/crnlsp/leathercad/commit/c43967a0b2481f4bb6df026674c21811318d253c))
* **desktop:** a half-drawn line is given up when its tab reloads from disk (Q39) ([#159](https://github.com/crnlsp/leathercad/issues/159)) ([865e087](https://github.com/crnlsp/leathercad/commit/865e087ece5478b83f7db02f4e4005c92b6c3b61))
* **desktop:** a Parts tree row is named by all it shows ([#144](https://github.com/crnlsp/leathercad/issues/144)) ([ee7fe7c](https://github.com/crnlsp/leathercad/commit/ee7fe7c5b6024a0117248dcd58d042777035e4a7))
* **desktop:** a quit no longer loses a preference changed just before it, or leaves a recovered copy behind ([#187](https://github.com/crnlsp/leathercad/issues/187)) ([bb08f12](https://github.com/crnlsp/leathercad/commit/bb08f121bbb45de0b629d0e7fa0d9765bf9c05e7))
* **desktop:** a save is flushed to disk and never writes a drag's preview (Q35, Q36) ([#149](https://github.com/crnlsp/leathercad/issues/149)) ([c679993](https://github.com/crnlsp/leathercad/commit/c67999342a695881e90a5680ad5f8d1f00cd3648))
* **desktop:** an opened pattern is framed, the Print dialog says it is finding printers, and the rectangle tool's first click is quiet ([#117](https://github.com/crnlsp/leathercad/issues/117)) ([e4145b9](https://github.com/crnlsp/leathercad/commit/e4145b94d7850ebde849a8c936ab8ed0631430ae))
* **desktop:** keep canvases sharp when display density changes (PERF-011) ([#212](https://github.com/crnlsp/leathercad/issues/212)) ([ec76d82](https://github.com/crnlsp/leathercad/commit/ec76d82520567e305610d631ab6edb068effe87e))
* **desktop:** on Windows the window opens with Properties beside the board, and on macOS it no longer shrinks below its layout ([#196](https://github.com/crnlsp/leathercad/issues/196)) ([a122c70](https://github.com/crnlsp/leathercad/commit/a122c7052fda21f21c7e6d9b92600b8d3e328d99))
* **desktop:** open keyboard context menus on macOS ([#214](https://github.com/crnlsp/leathercad/issues/214)) ([217b2bd](https://github.com/crnlsp/leathercad/commit/217b2bdc35a9dab21eca41dc3e9e80e276beffbf))
* **desktop:** switching between Design and Sheets shows that view's zoom at once ([#135](https://github.com/crnlsp/leathercad/issues/135)) ([7f6cc6c](https://github.com/crnlsp/leathercad/commit/7f6cc6c7c0bd4873cdb55521bd17ca1652f7cf02))
* **desktop:** the top bar's Saved is readable, at AA contrast ([#158](https://github.com/crnlsp/leathercad/issues/158)) ([baae09b](https://github.com/crnlsp/leathercad/commit/baae09b2541c72db67459d819d64738d157a3daf))
* **document:** undo or a command during a drag no longer scatters the piece across history ([#115](https://github.com/crnlsp/leathercad/issues/115)) ([7205ee3](https://github.com/crnlsp/leathercad/commit/7205ee34450defcce1b087e7a6ad223e6d8a784f))
* **domain:** a hardware hole is checked by its rim, not its centre (Q33) ([#137](https://github.com/crnlsp/leathercad/issues/137)) ([9282467](https://github.com/crnlsp/leathercad/commit/9282467c6bfc0fe9a1e881f87504ffdeb036d9c6))
* **domain:** two problems of one kind on one feature are told apart (Q4) ([#152](https://github.com/crnlsp/leathercad/issues/152)) ([e8ce73f](https://github.com/crnlsp/leathercad/commit/e8ce73f2ea522ef3191dd0a1e45b7e3046710b6f))
* **geometry:** a point beside a curve far from the origin is no longer read as inside it (Q38) ([#164](https://github.com/crnlsp/leathercad/issues/164)) ([b023c29](https://github.com/crnlsp/leathercad/commit/b023c29587e1b6496a965e7561d030b44e84268c))
* **geometry:** a tiny arc keeps its end when rounding puts it just past the tolerance (Q38) ([#157](https://github.com/crnlsp/leathercad/issues/157)) ([664d6e6](https://github.com/crnlsp/leathercad/commit/664d6e67dfed5438640aa6f447f9d637c33091a8))
* **geometry:** one home for every tolerance, and a lint rule that keeps it there (Q38) ([#150](https://github.com/crnlsp/leathercad/issues/150)) ([d404e75](https://github.com/crnlsp/leathercad/commit/d404e752b97f38b1504e05aea996960245f4d165))
* refuse oversized project work and preserve edits (PERF-012) ([#200](https://github.com/crnlsp/leathercad/issues/200)) ([7c77698](https://github.com/crnlsp/leathercad/commit/7c7769861ac416daf6c8358fae588d38fb1969e9))
* scaling a piece keeps its rivet holes, slots and labels their sizes (Q31) ([#162](https://github.com/crnlsp/leathercad/issues/162)) ([3cdad1c](https://github.com/crnlsp/leathercad/commit/3cdad1c607486d6111ad20021c39910b9aa231f2))
* **test:** give Stryker's unmutated run 30 minutes, not its default five ([#148](https://github.com/crnlsp/leathercad/issues/148)) ([80afa43](https://github.com/crnlsp/leathercad/commit/80afa43327594a7c58bb22aa202f14e47c6ce2b6))


### Performance

* **desktop:** a fold in Parts stays with its project, and goes with its tab (PERF-016) ([#193](https://github.com/crnlsp/leathercad/issues/193)) ([5272adc](https://github.com/crnlsp/leathercad/commit/5272adca52af8249762636d5148e6923bf94283e))
* **desktop:** a long PDF export no longer freezes the window, and can be cancelled (PERF-002) ([#166](https://github.com/crnlsp/leathercad/issues/166)) ([189a331](https://github.com/crnlsp/leathercad/commit/189a331d16afb50d92c17d5cd7829f7ccd82cf9a))
* **desktop:** a pointer moving over the board renders the readout alone (PERF-007) ([#197](https://github.com/crnlsp/leathercad/issues/197)) ([aac7bed](https://github.com/crnlsp/leathercad/commit/aac7bedb2f0268486a6fb381ad714f2884e5994d))
* **desktop:** a project replaced, edited or closed no longer leaves its Sheets pages behind (PERF-010) ([#189](https://github.com/crnlsp/leathercad/issues/189)) ([53078f7](https://github.com/crnlsp/leathercad/commit/53078f728491c73b8bc0e7113db5fcabf8801eb4))
* **desktop:** saving a large project, or writing its recovery copy, no longer stops the window (PERF-009) ([#199](https://github.com/crnlsp/leathercad/issues/199)) ([18801bc](https://github.com/crnlsp/leathercad/commit/18801bcc0273365ea548e1857fd0c08e80ad6240))
* **desktop:** stop scheduling frames while the board is idle (PERF-014) ([#213](https://github.com/crnlsp/leathercad/issues/213)) ([d38b45f](https://github.com/crnlsp/leathercad/commit/d38b45fe0a3a78312f426c6c071f345783bfa755))
* **desktop:** the Design board keeps its pattern between hover frames and draws only what reaches the canvas (PERF-008) ([#211](https://github.com/crnlsp/leathercad/issues/211)) ([e050d1e](https://github.com/crnlsp/leathercad/commit/e050d1e07c66a76f6aa5bb676f3e1b235904c5ee))
* **desktop:** the Sheets view stays smooth on a part taped across many sheets (PERF-003) ([#163](https://github.com/crnlsp/leathercad/issues/163)) ([a871fba](https://github.com/crnlsp/leathercad/commit/a871fba870e0a74b66e55a1175060b1ec6940c08))
* **domain:** a chain of sources is walked once, not once for each feature down it (PERF-015) ([#198](https://github.com/crnlsp/leathercad/issues/198)) ([05c54ee](https://github.com/crnlsp/leathercad/commit/05c54eead60fb4ebe1941165171d6a52efcc549a))
* **domain:** a rename, or an edit to another part, validates no geometry again (PERF-005) ([#192](https://github.com/crnlsp/leathercad/issues/192)) ([d4268e1](https://github.com/crnlsp/leathercad/commit/d4268e1d14c7056f55fff2d422a5be3ab13245ac))
* **editor:** dragging beside a complex outline no longer rebuilds every snap crossing (PERF-004) ([#168](https://github.com/crnlsp/leathercad/issues/168)) ([e845ffa](https://github.com/crnlsp/leathercad/commit/e845ffa447a03817cc2f1711570aa248a7d09fdb))
* **export:** a long taped part exports five times faster and a fifth the size (PERF-002) ([#161](https://github.com/crnlsp/leathercad/issues/161)) ([4852c71](https://github.com/crnlsp/leathercad/commit/4852c7102308114a7c8919afa8043d46f14e21dd))
* **geometry:** a traced outline no longer tests every pair of its segments for a crossing (PERF-006) ([#190](https://github.com/crnlsp/leathercad/issues/190)) ([a806a1b](https://github.com/crnlsp/leathercad/commit/a806a1bb801c4319b0a02277b981fd3c38f1713f))
* **preview:** draw thumbnails near view and end obsolete PDF loads (PERF-013) ([#205](https://github.com/crnlsp/leathercad/issues/205)) ([e9b7145](https://github.com/crnlsp/leathercad/commit/e9b7145a4e715e93bba3c2cc3bfa21546c08f160))
* renaming a part in a long session no longer grows memory by gigabytes (PERF-001) ([#160](https://github.com/crnlsp/leathercad/issues/160)) ([a9a2201](https://github.com/crnlsp/leathercad/commit/a9a2201e7a0a0c8de2e85059bf035940da0b2e55))

## [1.5.0](https://github.com/crnlsp/leathercad/compare/leathercad-v1.3.5...leathercad-v1.5.0) (2026-10-18)


### Features

* **desktop:** a bar under the selected piece says how its stitching came out and offers the next step (U.17) ([#104](https://github.com/crnlsp/leathercad/issues/104)) ([9f088eb](https://github.com/crnlsp/leathercad/commit/9f088ebaa2f8958333b87d7feb93892c13b14dfc))
* **desktop:** a selected outline's sizes sit beside it on the board, typed there, and a size the rectangle would not draw as stored is refused (U.14) ([#95](https://github.com/crnlsp/leathercad/issues/95)) ([423d5e4](https://github.com/crnlsp/leathercad/commit/423d5e48907236f4e73267fb465d2bd7d0da83a1))
* **desktop:** a zoom control says the zoom, Ctrl+0 is true size, and Shift+1 and Shift+2 fit (U.4) ([#78](https://github.com/crnlsp/leathercad/issues/78)) ([944f8f2](https://github.com/crnlsp/leathercad/commit/944f8f28e49388fcc593e0976869e4f845551652))
* **desktop:** keys can be changed in Settings › Keyboard shortcuts, and every cap follows (U.12) ([#101](https://github.com/crnlsp/leathercad/issues/101)) ([594f30e](https://github.com/crnlsp/leathercad/commit/594f30e2f74565000444cbb1a6abc7a93e18db29))
* **desktop:** Parts and Properties fold to strips, focus mode hides both, and the board gets the room at every window size (U.5) ([#85](https://github.com/crnlsp/leathercad/issues/85)) ([cd17f45](https://github.com/crnlsp/leathercad/commit/cd17f45798a094909863442ed2a5e0c7fbc83822))
* **desktop:** Parts is a tree of pieces that fold, shows hole counts at rest, and answers its own keys (U.8) ([#89](https://github.com/crnlsp/leathercad/issues/89)) ([9d5dca0](https://github.com/crnlsp/leathercad/commit/9d5dca0de2257289f5f5a141c371c6bce0bc293c))
* **desktop:** Properties follows the work, keeps Delete at its foot, and says what the job is (U.6) ([#79](https://github.com/crnlsp/leathercad/issues/79)) ([8104fe4](https://github.com/crnlsp/leathercad/commit/8104fe4aef08e2737d70de467aaf7e1d76e05ded))
* **desktop:** Properties shows the stitch margin and iron while a piece is drawn, and editing them edits My tools (U.18) ([#106](https://github.com/crnlsp/leathercad/issues/106)) ([29b321a](https://github.com/crnlsp/leathercad/commit/29b321a3b5f4164a93ab61ee721ba2a8227af742))
* **desktop:** Settings › My tools keeps the maker's irons, margin and leather, and new hole sets, stitch lines and folds start from them (U.13) ([#82](https://github.com/crnlsp/leathercad/issues/82)) ([b754880](https://github.com/crnlsp/leathercad/commit/b754880f8dd0d9dadcaefe0fe12b07e4d7f14116))
* **desktop:** sizes can be typed as sums and in inches or centimetres, and a size that cannot be read says why (U.15) ([#80](https://github.com/crnlsp/leathercad/issues/80)) ([8ac7a52](https://github.com/crnlsp/leathercad/commit/8ac7a525f27f5ffa2ee052de9361552fbd4a9d8b))
* **desktop:** the legend opens with names at the canvas's foot, and folds to a remembered chip (U.10) ([#96](https://github.com/crnlsp/leathercad/issues/96)) ([f03f62e](https://github.com/crnlsp/leathercad/commit/f03f62efd81b06dab02f6197ec2acc5f8a28aed5))
* **desktop:** the Sheets view has its own rail, Parts and Properties, and its labels read (U.9) ([#99](https://github.com/crnlsp/leathercad/issues/99)) ([03b81d4](https://github.com/crnlsp/leathercad/commit/03b81d4df97f305b4ca01002099c3c17812be287))
* **desktop:** the top bar says whether your work is saved, switches Design and Sheets, and shows the problems on Print before you print (U.7) ([#86](https://github.com/crnlsp/leathercad/issues/86)) ([f1fdcf3](https://github.com/crnlsp/leathercad/commit/f1fdcf3f378a0c933999ca59f3be1d8df7102453))
* **desktop:** the window's own controls are dark, focus rings tan, and nothing reaches the network (U.20) ([#92](https://github.com/crnlsp/leathercad/issues/92)) ([b2c81ff](https://github.com/crnlsp/leathercad/commit/b2c81ff3cb548ebc55e7fc2b38b9c661605c61fe))
* **desktop:** the work bar shows short hints with keys as caps, and ? all keys never drops (U.11) ([#100](https://github.com/crnlsp/leathercad/issues/100)) ([456938a](https://github.com/crnlsp/leathercad/commit/456938a1ab56b66b1e76fe81ab5161b826b6e5f8))
* **desktop:** type a rectangle's size while drawing it, 105 Tab 75 Tab 8 Enter (U.16) ([#98](https://github.com/crnlsp/leathercad/issues/98)) ([37824b6](https://github.com/crnlsp/leathercad/commit/37824b61fb63e6ef85e373466fe61778615a74d7))


### Bug Fixes

* **desktop:** F11 and Ctrl+Q can be captured in Settings (U.12) ([#102](https://github.com/crnlsp/leathercad/issues/102)) ([a789bc9](https://github.com/crnlsp/leathercad/commit/a789bc9c4e5ec60d4e6aa008ab7f4bc238f55951))
* **desktop:** Parts keeps a hole set's count in view while its lock and eye are shown (U.8) ([#90](https://github.com/crnlsp/leathercad/issues/90)) ([bfc878e](https://github.com/crnlsp/leathercad/commit/bfc878e69052172d9b1b3ce197c9fa396d269c7d))
* **desktop:** the window checked as one tool — the keys alone draw, a typed size lands in its chip, and the legend keeps off the ruler (U.19) ([#107](https://github.com/crnlsp/leathercad/issues/107)) ([fae1665](https://github.com/crnlsp/leathercad/commit/fae1665ba7a09c5ce8c4083751f8d2b35efaf271))


### Documentation

* **roadmap:** 1.5 is done — R9 goes into the release notes, and R8 and R10 move to 1.6 unverified ([#110](https://github.com/crnlsp/leathercad/issues/110)) ([ac05e16](https://github.com/crnlsp/leathercad/commit/ac05e168b32cb8464c3710d13f42d608cb80d39e))

## [1.3.5](https://github.com/crnlsp/leathercad/compare/leathercad-v1.3.0...leathercad-v1.3.5) (2026-10-09)


### Features

* **desktop:** keys work by where they are on any keyboard, show as caps, and tooltips stay one line inside the window (U.3) ([#70](https://github.com/crnlsp/leathercad/issues/70)) ([0102a14](https://github.com/crnlsp/leathercad/commit/0102a142a25c3757acc8a922f28137604a3a8a55))
* **desktop:** piece names and dimension numbers stay readable at every zoom (U.2) ([#69](https://github.com/crnlsp/leathercad/issues/69)) ([ebf5564](https://github.com/crnlsp/leathercad/commit/ebf55644535411e4ae887feb7eebb6486aaeb28c))
* **desktop:** pieces are filled on the board, and the grid and lines keep their size on any display (U.1) ([#68](https://github.com/crnlsp/leathercad/issues/68)) ([1414d8c](https://github.com/crnlsp/leathercad/commit/1414d8cc139cf203262bf2fefe5f3fe9b26d375b))
* **desktop:** print from LeatherCAD's own preview, with scaling off (7.6) ([#51](https://github.com/crnlsp/leathercad/issues/51)) ([4138d8f](https://github.com/crnlsp/leathercad/commit/4138d8fbfb882e66791a6d5ad911f149de27a3f9))
* **desktop:** print landscape sheets from the preview, turned onto upright paper (7.6b) ([#61](https://github.com/crnlsp/leathercad/issues/61)) ([2dec2aa](https://github.com/crnlsp/leathercad/commit/2dec2aa39707521697e703528c7ad9aa99464221))
* **export:** export the drawing as an R12 DXF in millimetres, for laser and CNC programs (6.5) ([#65](https://github.com/crnlsp/leathercad/issues/65)) ([2f4ad0a](https://github.com/crnlsp/leathercad/commit/2f4ad0a180237e46e4d0d61efb195cec26ab4a96))
* **export:** export the drawing as an SVG in true millimetres, a group to each layer (6.2) ([#64](https://github.com/crnlsp/leathercad/issues/64)) ([4a635a0](https://github.com/crnlsp/leathercad/commit/4a635a056dc2c1e19f6a7b38c4fc061cdfc23ee0))
* **export:** fewer sheets, with a slim scale strip and pieces turned to fit (7.8) ([#48](https://github.com/crnlsp/leathercad/issues/48)) ([cbbff3b](https://github.com/crnlsp/leathercad/commit/cbbff3b1f25eb71d73ef2dc61bcf846c7b1ad036))


### Bug Fixes

* **desktop:** clearer interface wording ([#57](https://github.com/crnlsp/leathercad/issues/57)) ([c8f0d0e](https://github.com/crnlsp/leathercad/commit/c8f0d0e427059d5bfd45ed85a89852b547b5b353))
* **geometry:** three points almost in a line give the straight line, not a vast arc ([#58](https://github.com/crnlsp/leathercad/issues/58)) ([4f3016f](https://github.com/crnlsp/leathercad/commit/4f3016f86ecae90c379c6627c4fbfa9e5337953b))
* parse numbers and iron labels in linear time (CodeQL polynomial-redos) ([#47](https://github.com/crnlsp/leathercad/issues/47)) ([88290ad](https://github.com/crnlsp/leathercad/commit/88290ad4d4bd7ad34fa09b2d274c8aa02c00786c))
* **render:** use the shared epsilons, not local ones ([#63](https://github.com/crnlsp/leathercad/issues/63)) ([4fb9788](https://github.com/crnlsp/leathercad/commit/4fb9788e210a9170d791f0147ce215cd7c57c4b7))


### Documentation

* **roadmap:** the next release is 1.3.5, a point release with U.1 to U.3 ([#72](https://github.com/crnlsp/leathercad/issues/72)) ([6a63ae2](https://github.com/crnlsp/leathercad/commit/6a63ae2b44e5aec5ec8d2b2c8a99d165cf3befd2))

## [1.3.0](https://github.com/crnlsp/leathercad/compare/leathercad-v1.2.0...leathercad-v1.3.0) (2026-09-30)


### Features

* **desktop:** a Language setting, and an interface ready to be translated (8.10) ([#40](https://github.com/crnlsp/leathercad/issues/40)) ([ae6c9b2](https://github.com/crnlsp/leathercad/commit/ae6c9b26b202ab86d32016fb6d6a9efa6bfec04c))
* **desktop:** a right-click menu for what is selected, on the board and in Parts (8.8) ([#34](https://github.com/crnlsp/leathercad/issues/34)) ([26b69d6](https://github.com/crnlsp/leathercad/commit/26b69d6cd6ae9e6cc468ec64eb18197375fa66e9))
* **desktop:** the window has its own top bar, with a Project menu, Settings and Help ([#33](https://github.com/crnlsp/leathercad/issues/33)) ([9b252d3](https://github.com/crnlsp/leathercad/commit/9b252d3e5489716a369b969d05dd78cef9966aaf))


### Bug Fixes

* a part picked by its heading is a real selection everywhere (Q29) ([#38](https://github.com/crnlsp/leathercad/issues/38)) ([292171e](https://github.com/crnlsp/leathercad/commit/292171e2238409e25a2a16ebfe15e3277ad0893c))
* **document:** flipping a piece flips all of it, not its outline alone (Q28) ([#35](https://github.com/crnlsp/leathercad/issues/35)) ([1515adb](https://github.com/crnlsp/leathercad/commit/1515adbdd0d3f12ec3860a6263119e1b43cd5db3))
* **geometry:** a curve that turns back on itself measures its whole length ([#28](https://github.com/crnlsp/leathercad/issues/28)) ([a003485](https://github.com/crnlsp/leathercad/commit/a003485831beca0a37d3cd509468b8f0794b7b08)), closes [#27](https://github.com/crnlsp/leathercad/issues/27)
* moving or turning a piece moves all of it, and a refused gesture moves nothing (Q30) ([#37](https://github.com/crnlsp/leathercad/issues/37)) ([deb9f75](https://github.com/crnlsp/leathercad/commit/deb9f756587b70da12a2b76090076fb3392f4002))

## [1.2.0](https://github.com/crnlsp/leathercad/compare/leathercad-v1.1.1...leathercad-v1.2.0) (2026-09-27)


### Features

* **desktop:** round a drawn path's corner to a radius, and sharpen it again (3.9d) ([ea0c45b](https://github.com/crnlsp/leathercad/commit/ea0c45b2dc75099e7dd164582c632bf97b554907))
* **desktop:** the Edit Points tool moves, adds and removes a drawn path's points (3.9c) ([2f1132a](https://github.com/crnlsp/leathercad/commit/2f1132a00041ce02079e0030e483c39305f18f40))
* **document:** drawn paths' points can be moved, added and removed without losing what is attached (3.9b) ([cfe6179](https://github.com/crnlsp/leathercad/commit/cfe61794f34d679bfc103210a390df8b8c299129))


### Bug Fixes

* **geometry:** a crossing's slack past a line's end is EPS_POINT at any length (Q25) ([a2d3d81](https://github.com/crnlsp/leathercad/commit/a2d3d81fb2447ba823ddfbcf9443cad14b14d767))

## [1.1.1](https://github.com/crnlsp/leathercad/compare/leathercad-v1.1.0...leathercad-v1.1.1) (2026-09-26)


### Bug Fixes

* the known bugs on the 1.1 roadmap — Q1, Q3, Q5, Q6 and 3.11 ([#21](https://github.com/crnlsp/leathercad/issues/21)) ([6380323](https://github.com/crnlsp/leathercad/commit/6380323ddcb383481ba9fa318ce10a50eac129ed))

## [1.1.0](https://github.com/crnlsp/leathercad/compare/leathercad-v1.0.1...leathercad-v1.1.0) (2026-09-26)


### Features

* **desktop:** a worked sample project, from Help or the empty Parts panel ([#15](https://github.com/crnlsp/leathercad/issues/15)) ([aab1ffe](https://github.com/crnlsp/leathercad/commit/aab1ffe83132af55e51850d60ef161fca987c717))
* **desktop:** double-click a project to open it, and a Flatpak ([#16](https://github.com/crnlsp/leathercad/issues/16)) ([7274055](https://github.com/crnlsp/leathercad/commit/72740552d8c0c570b6697857c579afc017cfedd7))
* **desktop:** preferences, File › Open Recent and a keyboard shortcut map ([#14](https://github.com/crnlsp/leathercad/issues/14)) ([d4fcf88](https://github.com/crnlsp/leathercad/commit/d4fcf888546c5b9ef357f70d24b94f8e6febdbfa))
* **desktop:** Tools, zoom and the paper in the application menu ([#17](https://github.com/crnlsp/leathercad/issues/17)) ([1bf6dbf](https://github.com/crnlsp/leathercad/commit/1bf6dbf6b6b134d00494bbe66114a8cbf5c0b21e))

## [1.0.1](https://github.com/crnlsp/leathercad/compare/leathercad-v1.0.0...leathercad-v1.0.1) (2026-09-24)


### Bug Fixes

* **desktop:** no socket or localhost in the shipped CSP ([#7](https://github.com/crnlsp/leathercad/pull/7)) ([d64a9c6](https://github.com/crnlsp/leathercad/commit/d64a9c6cb1a11091116dbd059ac3ada27576abcf))
* **desktop:** open only https: links outside the app ([#5](https://github.com/crnlsp/leathercad/pull/5)) ([f0d81a1](https://github.com/crnlsp/leathercad/commit/f0d81a1240395e549012e13135c36a763206ee5c))
* **desktop:** read, write and open only the files the user chose ([#6](https://github.com/crnlsp/leathercad/pull/6)) ([7930906](https://github.com/crnlsp/leathercad/commit/7930906f31c76b6d3351d2199b3b5a7e381cf731))

## 1.0.0 (2026-09-24)


### Features

* a control that cannot act says why, and every tool says how it is used (F.1) ([5f586b9](https://github.com/crnlsp/leathercad/commit/5f586b98cef70cd86451703f2e2512990c51b745))
* a light drafting ground, and colour that means one thing each (F.5) ([632c647](https://github.com/crnlsp/leathercad/commit/632c647e14ca3baf23fce4daadc62e0a4318abca))
* a number that cannot disagree with the drawing (4.10a) ([1e3152b](https://github.com/crnlsp/leathercad/commit/1e3152b88f6ed5ec6eb9e64beb33e4c02ba2a8f8))
* a part larger than the sheet is printed across sheets at 1:1 (7.2a) ([8938bb6](https://github.com/crnlsp/leathercad/commit/8938bb6ad1e74d4497fd54425fbcb8989060b676))
* an app icon, a desktop entry that matches its window, and a production menu (8.5a) ([7123c84](https://github.com/crnlsp/leathercad/commit/7123c84737f85c1ae212e1d645dfaab6f051ee0b))
* anchors carried through derivations (4.4b) ([3f02dcb](https://github.com/crnlsp/leathercad/commit/3f02dcb1b5e2a87a32fa3d81861c1f24c3f66852))
* arc segments in the polyline tool, for a pocket with a thumb scoop (3.9a) ([edc655a](https://github.com/crnlsp/leathercad/commit/edc655a111dc5a9f84080378cdf4cb9d222614b7))
* choose the paper and its orientation, and the square is whole on every sheet (6.4a) ([bf74964](https://github.com/crnlsp/leathercad/commit/bf749646e44729a1ed50b8b8e3019db5297fd147))
* **core:** epsilons, quantisation, guards, Result and ULIDs (slice 1.1) ([08ecc2d](https://github.com/crnlsp/leathercad/commit/08ecc2d8c0844557b7974b81aa48b7e9733d21f2))
* deleting asks what to do with what follows it (4.2b) ([28f9d36](https://github.com/crnlsp/leathercad/commit/28f9d36894661b19fb254e61e4cd6f70c7ca9b09))
* **desktop:** tool palette and window chrome (3.5a) ([d1fb626](https://github.com/crnlsp/leathercad/commit/d1fb6261cf09d455b2de630dd4f9e1a0d6e8c44a))
* dimension the pocket by its opening (4.9) ([5e21827](https://github.com/crnlsp/leathercad/commit/5e2182774f5bf000d86e9eaf882ca121dcde6e55))
* **editor:** arc tool, and the arc shape (3.6b) ([bf5a11e](https://github.com/crnlsp/leathercad/commit/bf5a11e843a0e0c0bb5c69c2ae3fe200d1db369a))
* **editor:** circle tool, and one property editor per shape (3.6) ([062d9ca](https://github.com/crnlsp/leathercad/commit/062d9cac60791d2b9ace7e9e5157fb95381b25f2))
* **editor:** line and polyline tools (3.5) ([ce91b29](https://github.com/crnlsp/leathercad/commit/ce91b297cf1b584d3ec0e4a5c359d4f7474904f9))
* **editor:** points land on the geometry they are aimed at (3.3b) ([5537fe2](https://github.com/crnlsp/leathercad/commit/5537fe29b7e3934d55e12f4d7939974376395e2f))
* **editor:** rotate and scale, and the rule for transforms that cannot (3.7) ([3f03970](https://github.com/crnlsp/leathercad/commit/3f0397010cf70d7789d88dbfecaea597417c7fea))
* **editor:** snap engine (3.3) ([9c39d10](https://github.com/crnlsp/leathercad/commit/9c39d10d79cb66ec8ca86c561e2096b7ff7eb723))
* Electron shell with a DPR-aware canvas (slice 0.2) ([f5f4ebe](https://github.com/crnlsp/leathercad/commit/f5f4ebe12b959c66d69c07ffc5989af1aad28fd2))
* every line named by its mark, and no emoji left (F.6) ([e5228fa](https://github.com/crnlsp/leathercad/commit/e5228faa907acf26a2eaff342f07a5100b68e413))
* every panel has a place of its own, and none disappears (F.2) ([780dc86](https://github.com/crnlsp/leathercad/commit/780dc869d3fe3e02782a01eb8c1beffc26a98d97))
* every problem reachable from where it is shown (4.12) ([6f9864b](https://github.com/crnlsp/leathercad/commit/6f9864b74bfc7a9ac2df436c3d0429e5c68280fa))
* **export:** print-ready 1:1 PDF (6.1, 6.3, 7.1, 7.3) ([f3a315e](https://github.com/crnlsp/leathercad/commit/f3a315ec24e35da18b13687137e0c3b996cafc69))
* geometry on screen — viewport, renderer, grid and rulers (M1) ([1588192](https://github.com/crnlsp/leathercad/commit/1588192abc445ec15e12302f3cb6139b8dd7c159))
* **geometry:** analytic offsetPath — arcs stay arcs (slice 1.9, Tier 1) ([6239549](https://github.com/crnlsp/leathercad/commit/6239549f52eb67e5876b19a11b3516d077c5e013))
* **geometry:** close slice 1.7 — the rest of the shape constructors ([806e4b0](https://github.com/crnlsp/leathercad/commit/806e4b0aa3829d5ab72237eaee670bafd80ee942))
* **geometry:** distributeAlongPath — holes at a pitch (slice 1.8) ([9d70197](https://github.com/crnlsp/leathercad/commit/9d70197097baf93f92b347ad403fc4714380d73e))
* **geometry:** flattening, and three numerical bugs it uncovered (slice 1.5) ([0b7c202](https://github.com/crnlsp/leathercad/commit/0b7c202162ef59d72c98e7ef8b08fc3cac94cec3))
* **geometry:** intersections — the last slice in Phase 1 (1.10) ([d7cd46f](https://github.com/crnlsp/leathercad/commit/d7cd46fb4d830cd8482b5dc6e2a31ba484f55647))
* **geometry:** Path, exact area and point containment (slice 1.4) ([a775421](https://github.com/crnlsp/leathercad/commit/a77542137ea1ed346d7f97960af22313d1c4a639))
* **geometry:** PathMeasure and arc-length parameterisation (slice 1.6) ([6d1c254](https://github.com/crnlsp/leathercad/commit/6d1c254e3fca651657f708a47870d926f766bf93))
* **geometry:** the Segment union — line, arc, cubic (slice 1.3) ([31a9d91](https://github.com/crnlsp/leathercad/commit/31a9d9176a0e99112148c7d330105709dad0866c))
* **geometry:** Vec2, Mat2x3 and Rect (slice 1.2) ([39b23b9](https://github.com/crnlsp/leathercad/commit/39b23b9b549a4e3a051ae5fd91e5a4b0d55f34de))
* labels you type, printed with everything else (4.11b) ([52e9b89](https://github.com/crnlsp/leathercad/commit/52e9b890d96a051403e757f4d9265b08d297a91e))
* one card holder from outline to paper, and a fold you can let go of (4.13) ([3066a86](https://github.com/crnlsp/leathercad/commit/3066a864b3e8de56e21b5b61a97530420bb2fdd8))
* one channel for everything that can be wrong (4.12a) ([53d1747](https://github.com/crnlsp/leathercad/commit/53d174713066c91e62323c40d684e16c7cae3363))
* one table for how everything looks, and screen and paper agree (F.4) ([4238042](https://github.com/crnlsp/leathercad/commit/42380420c59a7d92fd09121fd8a56b237990079f))
* one typeface, laid out once, outlined on paper (4.11a) ([8a87360](https://github.com/crnlsp/leathercad/commit/8a873609011e28826d4cc9914ad902b55b6b8595))
* **persist:** the .lcp project format — save and reopen (5.1) ([bec6f35](https://github.com/crnlsp/leathercad/commit/bec6f35f15069f15b8f0e260b098cc2719925d8c))
* property panel and parts list — exact millimetre editing (3.8) ([6a115e0](https://github.com/crnlsp/leathercad/commit/6a115e0e45a96e466a943f5748783c988e4f96c8))
* README, getting started, third-party notices and the update message (8.6b) ([dba5090](https://github.com/crnlsp/leathercad/commit/dba5090f0fc7eef15f2a852850d137dce2e1807e))
* **render:** SVG backend for the DisplayList (2.6) — Phase 2 closed ([d036668](https://github.com/crnlsp/leathercad/commit/d03666803f28538c65284e8b134034368293c008))
* stitching drawn as a pricking iron cuts it, and a key to the drawing (F.7) ([8fd1503](https://github.com/crnlsp/leathercad/commit/8fd15031c00e128c539ff024ce632794326952c7))
* symmetry that keeps working — mirror across a fold (4.8b) ([5155917](https://github.com/crnlsp/leathercad/commit/51559174edeb9bcb640a2fbaae2d4093cfc7bfa0))
* the app becomes a tool — domain, document, and drawing (M2) ([42d4f06](https://github.com/crnlsp/leathercad/commit/42d4f065b94917133c35cc9c9486d462be75d2a7))
* the derivation chain — cut contour to stitch holes (M3) ([353faf8](https://github.com/crnlsp/leathercad/commit/353faf8fcce8368f9a88c11da65d8f14967dd2b3))
* the drawing moves only when the maker moves it (F.3) ([5788ec1](https://github.com/crnlsp/leathercad/commit/5788ec1881345601ae4da723d4d9b79844300f23))
* the interface speaks in the typeface the pattern prints in (F.0) ([5dc50d9](https://github.com/crnlsp/leathercad/commit/5dc50d9bd11c3d0f05a7ea9e35ca88f516bc611b))
* the project says which paper it prints on (5.5), and the UI/UX audit ([39795f7](https://github.com/crnlsp/leathercad/commit/39795f7d467dc5c0552f8f337a9e637abec871c7))
* unsaved work is never thrown away without asking (5.3a) ([e747012](https://github.com/crnlsp/leathercad/commit/e74701287f2114d51808c371b8a3b9626af2ffbe))
* Windows and macOS installers, built and smoke-tested in CI (8.6a) ([30b1041](https://github.com/crnlsp/leathercad/commit/30b10410ec8852d253d8eef396aafbc84be874f0))
* work interrupted by a crash is offered back on the next start (5.3b) ([d9438ee](https://github.com/crnlsp/leathercad/commit/d9438eef584dde5009dace79f00b605765c9db15))


### Bug Fixes

* a newer build's fields survive opening and saving a file (5.2) ([20ce0a4](https://github.com/crnlsp/leathercad/commit/20ce0a4f2cb46ed95d75a37e83d3717f46ac8290))
* a printed dimension keeps its dimension line, not just its number ([66296b4](https://github.com/crnlsp/leathercad/commit/66296b4f61b8566da48a4f95e87ec1c0242eb22d))
* a stitch pitch finer than any iron is refused on its hole set, not by running out of memory (5.6) ([f8345ca](https://github.com/crnlsp/leathercad/commit/f8345caa6580e8871234b1d27631cab4d726a983))
* **desktop:** paint the first frame without waiting for an animation frame ([6dbd520](https://github.com/crnlsp/leathercad/commit/6dbd520bf307de03021adbdd8b5b1e35f36e139a))
* **geometry:** a cubic's tangent points the way it travels at a stationary end ([68f17c5](https://github.com/crnlsp/leathercad/commit/68f17c50fc78f065af6b37a1f322c2683f279ed9))
* **geometry:** PathMeasure collapsed every edge after the first ([0d8ef27](https://github.com/crnlsp/leathercad/commit/0d8ef2745c79a29816055193a93d7a4db436ecd3))
* saving while a recovery copy is being written no longer leaves a stale copy ([a9fe95a](https://github.com/crnlsp/leathercad/commit/a9fe95a0f73194771d87dd25a7e3d2f216edb7f8))


### Performance Improvements

* **geometry:** adaptive quadrature for cubic length ([6bee6bf](https://github.com/crnlsp/leathercad/commit/6bee6bfb16cc49e344fe1e6925d0643942429f7e))
