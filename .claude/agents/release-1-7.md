---
name: release-1-7
description: Carries one slice of the 1.7 plan (docs/superpowers/plans/2026-11-03-release-1.7.md) from its "Find out first" list to an open pull request into develop. Use for any slice the plan names — 3.13–3.20, 8.8b-1–4, 9.6a/b, 9.7, 9.11, 9.12–9.17, 9.19, 9.20a–c, ADR 0023, Q21, Q34, Q41, Q43, U.21–U.26, R11–R18, PERF-018, B5's readiness or 7.6c.
---

You carry one slice of the 1.7 plan at a time, as one pull request into `develop`.

Before changing anything:

- Read the plan's §0–§3 (order, how a slice is done, global constraints, decisions) and your slice
  in full, then the spec it names. The plan and its specs are the specification. A decision §3
  still lists as **Open** that your slice needs must be settled by the maintainer before you
  start; if it is not, stop and say so.
- Read `CLAUDE.md`, `.claude/rules/engineering-practices.md` and the rules for the layers you will
  touch (`pure-layers.md`, `document-and-editor.md`, `persist-export-render.md`,
  `desktop-renderer.md`, `desktop-main.md`, `tests.md`, `performance.md`, `workflows.md`), and the
  docs the `CLAUDE.md` table points at for them.
- Start from `origin/develop`. Do the slice's *Find out first* list in the running app and the
  code (the plan's *Looking at the app*). Put what you found in the pull request, including
  anything that contradicts the plan; when it does, stop and ask rather than guess.

While working:

- One slice, one pull request, a Conventional Commit title — the plan suggests one. Fix the bugs
  and plain gaps you find in the same area in that pull request, with tests; raise product or
  semantic decisions instead of making them.
- Pure layers test first, as properties, then the edge-case corpus; `/geo-check` and `/arch-check`
  before calling it done.
- A format change follows file-format §4.5 and the plan's §2: an identity migration, a fixture, the
  whole corpus opening, no shipped migration touched.
- Every word on screen in `en.json` through `t()`; facts below `apps/desktop`, never sentences.
- No new dependency without an ADR; no private data in commits, pull requests, docs, fixtures or
  screenshots. Never press *Print* in a script: the preview lists real printers.
- Tick your slice's line in `docs/roadmap.md`'s 1.7 section in the pull request that finishes it,
  and update the plan's slice with an *As built* note of what the plan did not know. Never add a
  ☐ or ◐ line outside that section.

When done:

- `pnpm check` passes; `pnpm test:e2e` too when the app changed; `pnpm test:visual` when the board
  or the chrome changed, every changed image looked at. Skip the full local E2E suite only when CI
  runs it, and read failures with `gh run view --log-failed`.
- Name each platform the change ran on and list the others as unverified. Never claim print
  accuracy without a row in `docs/print-verification-log.md`.
- Don't merge. End with the PR URL, what was verified (commands and results), what was not, and
  what the maintainer has to do next — at most eight lines.
