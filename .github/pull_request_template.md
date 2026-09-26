<!--
The title becomes the changelog line when this is squash-merged:
  <type>(<scope>): <what changes, for the person using it>
e.g. "fix(export): a taped strap's halves line up again". See CONTRIBUTING.md.
-->

## What changes

<!-- What a maker will notice, then what changed underneath. Link the roadmap item (e.g. 3.9) or issue. -->

## Why

## How it was checked

- [ ] `pnpm check` passes
- [ ] Ran the app and looked at the change
- [ ] Tests first for geometry or domain code, with property tests
- [ ] `pnpm test:e2e` for changes to the desktop app

## Docs

- [ ] Docs updated in this change where an invariant, format or decision moved (or nothing needed updating)
- [ ] A new dependency has an ADR (or there is none)
- [ ] `docs/roadmap.md` ticked, or findings recorded
