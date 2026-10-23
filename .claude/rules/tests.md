---
paths:
  - '**/*.test.ts'
  - '**/*.bench.ts'
  - 'e2e/**'
---

# Tests

The strategy is `docs/testing.md`; read the section for the layer you are testing.

- **The test is the specification.** Its name says what must hold, in the domain's words:
  "splitting a path at any t gives two paths whose lengths sum to the original", not "split works".
- **Arrange, act, assert — once.** One behaviour per test. A test that needs a paragraph to
  explain its setup is testing too much, or the code is hard to use.
- **Reuse the generators and builders.** `packages/geometry/test/arbitraries.ts` for properties,
  `packages/export/test/scenes.ts` for export, the package's existing helpers otherwise — rather
  than a large literal. A reader should see only the values that matter to the test.
- **No mocks of our own code.** Fake only the boundaries — the clock, entropy, `PlatformHost`, the
  file system. A test that mocks a sibling module tests the mock.
- **End-to-end tests drive what a maker does**, through the real Electron app, and wait for a
  visible state, not a fixed delay. The one exception is proving something did *not* happen — no
  tooltip, no dialog — where a short `waitForTimeout` is the only way; say so in a comment. Reuse
  the helpers in `e2e/`; a new helper goes there.
- **A benchmark measures one thing and keeps its baseline honest.** Compare with
  `pnpm bench:compare` on the same machine; a budget is not loosened to make a run pass.
