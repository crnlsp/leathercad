# 1. Record architecture decisions

**Status:** Accepted
**Date:** 2026-09-03

## Context

This project makes several decisions that look arbitrary from the code and will be questioned later
— Electron over Tauri, TypeScript over Rust, a derivation graph over a constraint solver. Without a
record, the reasoning is lost and the decision gets relitigated from scratch, usually with less
information than the first time.

## Decision

Record every architecturally significant decision as a numbered Markdown file in `docs/adr/`.

A decision is architecturally significant if it is expensive to reverse, constrains later choices,
or adds a dependency. In particular: **every new dependency gets an ADR**, because dependencies are
architecture.

Format: Context, Decision, Consequences, Alternatives rejected. One page. Never edit an accepted
ADR — supersede it with a new one that references it.

## Consequences

- The reasoning behind a decision survives the person who made it.
- Reversing a decision requires explicitly superseding it, which is a small but useful speed bump.
- Marginal overhead: a few minutes per decision.

## Alternatives rejected

- **Comments in code.** They rot, they scatter, and they cannot explain a decision that spans
  packages.
- **A single DECISIONS.md.** Grows unreadable and produces merge conflicts.
