# 6. fflate and zod for the .lcp file format

**Status:** Accepted
**Date:** 2026-09-04

## Context

`.lcp` is a ZIP container holding JSON, a thumbnail and content-addressed assets
(`docs/file-format.md` §1). Two capabilities are needed: writing and reading ZIP archives, and
validating untrusted JSON at the load boundary.

The user asked whether PDF could serve as the save format. It cannot: a PDF holds drawn geometry,
not parameters, so a saved pattern could never be reopened as an editable 105 × 75 rounded
rectangle with named parts. PDF is an export format and `.lcp` is the save format; the two coexist.

## Decision

**fflate** (MIT) for the container. Small, synchronous, no native dependencies, and it works
identically in the Electron main process and in tests. The alternatives are heavier
(`jszip` pulls a promise-based API this does not need) or native (`node:zlib` handles deflate but
not the ZIP structure, which would mean writing the central directory by hand).

**zod** (MIT) for validation. Schemas mirror the domain types and run at the one place untrusted
data enters the system. The value is not "is this JSON" — `JSON.parse` answers that — but
producing a **path-qualified** message like `parts[2].features[0].source.distanceMm: expected
number, received string` instead of "invalid file". A user's project is hours of their work; the
error has to say what is wrong with it.

## Consequences

- Two more runtime dependencies in `packages/persist`. Neither reaches `geometry` or `domain`,
  which stay dependency-free.
- Schemas duplicate the domain types. That duplication is deliberate: the schema describes what a
  *file on disk* may contain, which drifts from the in-memory types as migrations accumulate. A
  generated schema would silently accept whatever the current types happen to be.
- Migrations run on raw JSON **before** validation. Validating first would reject old files by
  definition.

## Alternatives rejected

- **Plain JSON, no container.** Simpler for about two weeks, until tracing images arrive and have
  to be base64-encoded into the document, inflating it by a third and making it unreadable.
- **A binary format.** The usual argument is size, and it does not apply: derived geometry is never
  stored, so a complex project is tens of kilobytes. JSON is inspectable, diffable in git, and
  readable by tests.
- **Hand-rolled validation.** Feasible, but every field would need its own error message and they
  would rot out of sync with the types.
