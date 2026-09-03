---
description: Typecheck, lint, layering and tests for the pure layers, with golden diffs called out
---

Run the full check suite and report what actually happened.

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm check
```

(The `PATH` line is needed until `sudo pacman -S pnpm` has been run — pnpm 11 re-invokes itself from
`PATH`, so a bare path to the binary is not enough.)

Then report:

1. **Pass or fail per stage** — typecheck, lint, layering, tests. Quote the real output.
2. **Any golden-fixture diff**, prominently. A changed golden is a behaviour change; say what moved
   and whether it was intended. Never wave one through.
3. **Any fast-check counterexample**, with the shrunk input. That input should become a committed
   regression test.
4. **Coverage of the pure layers** if it was run — `packages/core`, `packages/geometry`,
   `packages/domain` are held to 90% lines and 85% branches, and branch coverage is the one that
   matters, because the untested branches are the degenerate cases.

If anything failed, diagnose before proposing a fix. A geometry test failing by 1e-16 is a wrong
epsilon; failing by 0.3 mm is a wrong algorithm. They need different responses.
