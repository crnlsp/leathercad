# 2. Electron over Tauri

**Status:** Accepted
**Date:** 2026-09-03

## Context

LeatherCAD needs a desktop shell. Linux is the only target for v1; Windows and macOS come later. The
product promise is exact 1:1 printing, and the editor is a canvas-heavy CAD surface.

Tauri is the obvious modern choice on size and memory: ~10 MB bundles against Electron's ~150 MB,
and materially lower RAM.

## Decision

Use Electron.

The deciding factors are specific to this project rather than general:

1. **One pinned rendering engine.** Electron bundles Chromium. Tauri uses the system webview —
   WebKitGTK on Linux, WebView2 on Windows, WKWebView on macOS. Going cross-platform later would
   mean validating canvas rendering and font metrics against three engines at a 0.1 mm accuracy bar.
2. **WebKitGTK is the weakest of the three** for heavy Canvas2D, and has a history of Linux
   DMA-BUF renderer bugs requiring `WEBKIT_DISABLE_DMABUF_RENDERER=1` workarounds on some
   configurations.
3. **Node in the main process.** PDF generation, ZIP handling, file I/O and CUPS submission are
   ordinary npm packages rather than Rust bindings or a bundled sidecar.
4. **Playwright drives Electron directly**, which is what makes the visual-regression and E2E layers
   in `docs/testing.md` affordable.
5. **No Rust toolchain** to maintain alongside the TypeScript one.

Bundle size and memory matter little for a tool installed once and run for hours.

## Consequences

- Larger downloads and higher idle memory. Accepted.
- The webview is **never** in the print path regardless — PDFs are generated as vector content by
  `packages/export/pdf` — so this decision does not affect print accuracy. See `docs/printing.md`
  §2.
- Electron security posture is mandatory: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, a preload exposing only the typed `PlatformHost` channel, strict CSP, no remote
  content.

## Reversibility

Deliberately preserved. All application logic lives in platform-agnostic packages that import
nothing from Electron, reached only through the narrow `PlatformHost` interface
(`docs/architecture.md` §5). `dependency-cruiser`'s `electron-only-in-desktop` rule fails CI if
anything else imports Electron. Switching to Tauri means reimplementing that interface — a few
hundred lines — not a rewrite.

## Alternatives rejected

- **Tauri v2.** See above. Revisit if bundle size becomes a distribution problem, or if WebKitGTK's
  canvas performance improves enough to make the cross-platform validation cost acceptable.
- **Native GTK/Qt.** Would abandon the TypeScript ecosystem for PDF generation (`pdf-lib`) and
  testing, which is where this project's leverage is.
