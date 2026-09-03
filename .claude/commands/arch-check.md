---
description: Report layering violations and check the dependency graph against the documented architecture
---

```bash
export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"
pnpm depcruise
```

Report each violation with the rule that fired and why that rule exists — the rules carry comments
explaining themselves, so quote them rather than paraphrasing.

Then check what the tool cannot:

1. **Does the layer graph in `.dependency-cruiser.cjs` still match `CLAUDE.md` § Layout and
   `docs/architecture.md` §2?** All three must agree. If they have drifted, that is the finding.
2. **Did any recent change add a new edge between packages?** A new edge is an architecture
   decision. It needs an ADR in `docs/adr/`, not a quiet import.
3. **Is anything importing Electron outside `apps/desktop`?** That is what keeps the shell
   replaceable (ADR 0002).
4. **Is Clipper imported anywhere but `geometry/internal/clipper.ts`?** Isolating it is what makes
   it swappable (`docs/geometry.md` §6.3).

A violation is not automatically a bug in the code — it can be a bug in the rule. Slice 0.2 found
`no-dev-deps-in-src` was wrong for an Electron app, where the runtime is correctly a devDependency
because the packager bundles it. Judge which one is wrong before changing either.
