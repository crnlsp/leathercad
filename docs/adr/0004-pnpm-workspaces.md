# 4. pnpm workspaces

**Status:** Accepted
**Date:** 2026-09-03

## Context

The architecture depends on strict layering between eleven packages
(`docs/architecture.md` §2). The main risk to that architecture is not a deliberate violation but an
accidental one — an import that happens to resolve because everything is flat in `node_modules`.

npm and Yarn workspaces hoist dependencies into a shared `node_modules`, so a package can import
something it never declared, and nothing complains until the day it is packaged separately.

## Decision

Use pnpm workspaces.

pnpm's non-flat `node_modules` means a package can only import what it declares. That turns a class
of layering violation into an immediate resolution error rather than a latent bug, which is exactly
the failure mode this project is most exposed to.

`dependency-cruiser` enforces the direction of dependencies; pnpm enforces their existence. The two
are complementary and neither replaces the other.

## Consequences

- pnpm must be installed. It is not bundled with Node, and Arch's `nodejs-lts-jod` package does not
  ship corepack. See the Development section of `README.md`.
- The lockfile is `pnpm-lock.yaml`; CI uses `pnpm/action-setup`.
- pnpm 11 gates very recent releases behind a minimum release age; accepted exclusions are recorded
  in `pnpm-workspace.yaml` under `minimumReleaseAgeExclude`.
- Diverges from the sibling Leathercrafto project, which uses npm. Accepted — that project is a
  single package with no layering to enforce.

## Alternatives rejected

- **npm workspaces.** Already installed and matches Leathercrafto, but hoists, which forfeits the
  main benefit.
- **Nx or Turborepo.** Task orchestration for a workspace this size is not yet a problem. Revisit if
  a full `pnpm check` exceeds a minute.
