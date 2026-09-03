# 5. Pin TypeScript to 5.9.3

**Status:** Accepted
**Date:** 2026-09-03

## Context

TypeScript 7.0.2 is the current `latest` release. `typescript-eslint@8.69.0` declares a peer
dependency of `typescript >=4.8.4 <6.1.0`, so TypeScript 7 would leave the project without
type-aware linting.

The lint rules are not cosmetic here. They carry several of the invariants that are invisible in the
code — no float equality, no pixels in the pure layers, no `Math.random()` or `Date.now()` in
deterministic paths (`CLAUDE.md` § Invariants). Losing them to gain a compiler version is a bad
trade this early.

## Decision

Pin TypeScript to exactly `5.9.3` — an exact version, not a range, so the constraint is visible
rather than silently satisfied by a resolver.

## Consequences

- No TypeScript 6 or 7 language features. None are needed for this codebase today.
- The pin must be revisited. Upgrade when `typescript-eslint` widens its peer range, verify
  `pnpm lint` still enforces every rule in `eslint.config.js`, and supersede this ADR.

## Alternatives rejected

- **TypeScript 7 without typescript-eslint.** Trades the project's mechanised invariants for a
  compiler version. The invariants are worth more.
- **TypeScript 7 with `--legacy-peer-deps`.** Hides a real incompatibility rather than resolving it,
  and produces confusing failures later.
