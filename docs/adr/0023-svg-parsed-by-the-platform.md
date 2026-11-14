# 23. SVG is parsed by the platform and converted by a headless package

**Status:** Accepted
**Date:** 2026-11-14

Records D6 of [the 1.7 plan](../superpowers/plans/2026-11-03-release-1.7.md#3-decisions), approved
on 2026-11-03. Replaces [architecture](../architecture.md) §2's earlier note that SVG import would
begin with an XML parser as a new dependency.

## Context

Roadmap 9.20 brings a pattern in from an SVG file, as Inkscape and Illustrator write them, at its
true size. An SVG file is XML from outside the app, and XML can carry what a pattern never needs:
scripts, event handlers, `javascript:` links, references to other files and hosts, and entity
declarations that expand a small file into a very large one. The importer has to read the shapes
and nothing else, refuse what it cannot read safely, and never freeze the window or reach the
network or the disk doing it.

Three questions decide its shape: what parses the XML, where, and what crosses from the parser
into the packages.

The renderer already holds a conforming XML parser, Chromium's `DOMParser`, under the
Content-Security-Policy in `apps/desktop/src/renderer/index.html` (`script-src 'self'`,
`connect-src 'self'`, `img-src 'self' data:`). Before deciding to trust it, it was measured: a
hostile corpus was parsed under that policy in Chromium 153 through Playwright, on 2026-11-14.

| Input | What the parser did |
|---|---|
| `<script>`, `onload`, `<a href="javascript:…">` | Nothing ran. The parsed document has no window (`defaultView` is `null`) |
| `<image href>`, `<use href>` to another host, `<?xml-stylesheet?>`, CSS `@import` and `url()`, an external DTD, an `<iframe>` and an `<img>` in `<foreignObject>` | No request was made |
| An external entity naming a local file | Not resolved: the entity read as empty |
| `xi:include` of a local file | Not processed |
| Nested entities, ten deep, ten wide ("billion laughs") | Refused at once: *Entity too big* |
| Elements nested 100,000 deep | Refused after about 5,000: *Excessive node nesting* |
| Malformed XML | A document holding a `<parsererror>` element, not an exception |
| **One 50 kB entity referenced 50,000 times, in a 200 kB file** | **Refused, but only after 12.5 s** of the parser's own work |
| 32 MiB of ordinary paths (385,683 elements) | Parsed in 2.1 s; walked in 0.36 s |

Every row but one is the behaviour wanted. The exception, quadratic entity expansion, would hold
the window frozen for seconds on a file small enough to look ordinary.

## Decision

**Chromium's `DOMParser` parses, in the renderer, and a new headless package, `packages/import`,
converts.** No XML dependency is added anywhere.

The file crosses the boundary in this order, and each step refuses the whole file — a refusal is
a typed fact the app words, never a partial import:

1. **The maker chooses the file.** A dialog grants the path (`pathGrants.ts`); the main process
   reads it and hands the renderer its bytes through `PlatformHost.readFile`, as for a project.
2. **The bytes are bounded before anything reads them.** The same 32 MiB as PERF-012's archive
   input, as a resource of its own in `RESOURCE_LIMITS` ([resource limits](../resource-limits.md)),
   checked on the byte array.
3. **They are decoded strictly.** `TextDecoder` with `fatal: true`: UTF-8 unless a byte-order mark
   or the XML declaration names another encoding the platform knows. Invalid bytes are refused,
   not replaced.
4. **The entities are checked before the parser sees them.** `import` reads the document type's
   internal subset as text and refuses an external entity (`SYSTEM` or `PUBLIC`), an entity that
   refers to itself through others, or a document whose entities, expanded, would exceed the
   32 MiB expanded-bytes ceiling. The expansion is computed from the declarations and a count of
   their references, never by expanding them. It is pure, so it is tested in Node. This is the step
   the 12.5 s measurement asks for; the parser's own guard stays behind it, for anything this one
   misses.
5. **The platform parses.** `new DOMParser().parseFromString(text, 'image/svg+xml')`. A
   `<parsererror>` anywhere, or a root that is not `svg` in the SVG namespace, refuses the file as
   unreadable.
6. **The parsed document is read, never shown.** It is never adopted into the window: no
   `appendChild`, `importNode`, `adoptNode` or `innerHTML`, and nothing is rendered from it. It is
   walked once and dropped. The policy is the second line: even adopted, the window could load
   nothing from elsewhere.
7. **Only plain data crosses into `import`.** The renderer walks the document iteratively into a
   tree of elements alone — each with its namespace, its local name, its attributes (namespace,
   local name, value, all strings) and its children in order — counting each element against
   PERF-012's 500,000-node ceiling as it goes. Text, comments and processing instructions are not
   carried.
8. **`import` converts.** Pure and headless: the tree in, geometry and later pieces out, with the
   file's units read into millimetres and **Y flipped once, there**, as `export/src/svg` flips its
   own on the way out (CLAUDE.md invariant 2).

**The package.** `packages/import` may import `core`, `geometry` and `domain`, and is imported only
by `apps/desktop` (and the reserved `ui` and `cli`). Its TypeScript configuration has no DOM
library, so it cannot name `DOMParser` or an element, and dependency-cruiser refuses it a Node
built-in, as it refuses `geometry` one. It is created by 9.20a; the rules hold from now.

## Consequences

- **Parsing is tested in the app, converting in Node.** `DOMParser` is not in Node, so steps 5–7
  are covered by end-to-end tests in Electron, and 9.20c runs its hostile corpus there. Steps 2–4
  and 8 are pure and get unit and property tests. The measurements above are re-taken in that
  corpus against Electron's own Chromium, since that is the one that ships.
- **The window is busy while a large file parses** — about two seconds at the 32 MiB ceiling.
  `DOMParser` is not available in a worker, so the import shows that it is working before it
  starts.
- **Text does not cross.** `<text>` is listed among what was left out (9.20c), as planned. CSS in a
  `<style>` element does not reach the converter either, so class-based styles cannot decide what a
  shape is: 9.20b decides roles from geometry and from layer names, which are attributes and do
  cross.
- **Older Illustrator files still read.** Their document types declare a handful of short,
  unnested namespace entities, referenced a few times, far under the ceiling.
- **The plain tree is the seam.** Should the parser ever change — another shell than Electron
  (ADR 0002) — whatever produces the same tree replaces `DOMParser` without touching `import`.
- **`SECURITY.md` names SVG files as input in scope** when 9.20 ships, with the steps above as the
  boundary a report would test.
- **No new dependency.**

## Alternatives rejected

- **An XML library** (`@xmldom/xmldom`, `sax`, `fast-xml-parser`) in `import` or the main process. A
  new dependency in the most security-relevant path the app has, each with its own history of
  entity and depth bugs, and each needing the same corpus to trust. The platform's parser is the
  one Chromium maintains and fuzzes, and it was already there.
- **Parsing in the main process.** Node has no `DOMParser`, so it would mean the library above, and
  it would put content parsing into the one process that touches the disk.
- **Rendering the file to read it** — an `<img>`, `<object>` or hidden window. A browsing context
  renders, may fetch and runs scripts: the opposite of the inert document a parser gives.
- **Handing `import` the DOM, or the text.** `import` would need the DOM library, could not run in
  Node tests or a future CLI, and would be the second package to touch the platform.
- **Trusting the parser's own entity guard.** Measured: 12.5 s with the window frozen.
- **Refusing every document type declaration.** Safe, but it refuses older Illustrator exports for
  a harmless declaration of namespace names, and the expansion check costs a linear scan.
