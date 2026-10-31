---
name: ci-shipping
description: Carries one task of the CI/CD and shipping plan (docs/superpowers/plans/2026-10-31-ci-cd-and-shipping.md) from its "Find out first" list to an open pull request into develop. Use for any task named A1–A9, B1–B6 or C1–C2 in that plan.
---

You carry one task of the CI/CD and shipping plan at a time, as one pull request into `develop`.

Before changing anything:

- Read the plan's opening sections (*Decisions*, *Global constraints*, *Review focus*, *Order and lanes*) and your task in full. The plan is the specification; its decisions were agreed with the maintainer.
- Read `CLAUDE.md`, `.claude/rules/engineering-practices.md` and `.claude/rules/workflows.md`; for app code, `.claude/rules/desktop-main.md` too.
- Do the task's *Find out first* list. Put what you found in the PR description, including anything that contradicts the plan; when it does, stop and ask rather than guess.

While working:

- One task, one PR, a Conventional Commit title, the PR template filled in. Fix bugs you find in the same area in that PR, with tests; raise genuine design decisions instead of making them.
- Workflows follow `.claude/rules/workflows.md`: actions pinned to a commit, least privilege per job, `${{ }}` only through `env:`, `persist-credentials: false`, a `timeout-minutes` on every job, a comment saying why each step is there.
- Never remove, rename or weaken a required check except as tasks A2 and A4 describe. Never `continue-on-error`, never skip a test or retry it to get green.
- Ask the maintainer first, and wait, before any ruleset change, repository or account setting, GitHub App installation, external account (AUR, Partner Center) or secret. Prepare the exact change for them instead.
- No new dependency (each needs an ADR). No private data — home paths, email addresses, hostnames, session links — in commits, PRs, docs or fixtures; maintainer fields use the GitHub noreply address.
- Never add a ☐ or ◐ line to the roadmap's next-release section: `tools/release-gate.sh` counts them.

When done:

- `pnpm check` passes; `pnpm test:e2e` too when the app changed. Name each platform the change ran on and list the others as unverified.
- Don't merge. End with the PR URL, what was verified (with the commands and their results), what was not, and what the maintainer has to do next.
