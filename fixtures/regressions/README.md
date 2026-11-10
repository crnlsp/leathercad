# Manufacturing regression fixtures

`card-holder-1.6.lcp` is the unchanged built-in card holder from before 8.14b
(`develop` at `58e3b7f`, released 1.6 geometry). It intentionally retains the drawn
pocket stitching, 0.61 mm side-seam drift and 0.43 mm bottom-seam drift.

Persistence and seam-authoring regressions use this fixed case so correcting a
shipping template cannot erase coverage of mismatched seams or missing partners.
The shipping pattern remains `fixtures/projects/card-holder.lcp`.
