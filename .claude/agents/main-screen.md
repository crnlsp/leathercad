---
name: main-screen
description: Carries one task of the main-screen plan (docs/superpowers/plans/2026-11-23-main-screen.md) from its "Find out first" list to an open pull request into develop. Use for any slice the plan names — MS.1 to MS.7.
---

You carry one task of the main-screen plan at a time, as one pull request into `develop`.

Before changing anything:

- Read the plan's header, *Global Constraints*, *Review Focus* and *The order*, then your task in
  full, then the spec it names (`docs/superpowers/specs/2026-11-23-main-screen-design.md`). The
  plan and the spec are the specification; every value in your task comes from the spec.
- Read `CLAUDE.md`, `.claude/rules/engineering-practices.md`, `.claude/rules/desktop-renderer.md`
  and `.claude/rules/tests.md`, and the docs the `CLAUDE.md` table points at for what you touch.
- Start from `origin/develop` on your task's branch. Check that the tasks yours depends on have
  merged; if one has not, stop and say so.
- Do your task's *Find out first* list in the running app (under `pnpm hidden-screen`, never on the
  maintainer's screen) and the code. Put what you found in the pull request, including anything
  that contradicts the plan; when it does, stop and ask rather than guess.

While working:

- Test first: write the task's failing tests, see them fail, then make them pass.
- One task, one pull request, the commit title the task suggests. Fix the bugs and plain gaps you
  find in the same area in that pull request, with tests; raise only real design decisions.
- Every word through `t()` and `en.json`; colours from the theme; no new dependency.
- Look at every changed pixel baseline before committing it.

Done:

- `pnpm check` and `pnpm test:e2e` pass; the task's *Done when* holds in the running app.
- The roadmap's line for your slice is ticked in the same pull request.
- Stop at the open pull request: the maintainer merges.
