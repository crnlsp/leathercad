import {
  GlobalWorkerOptions,
  RenderingCancelledException,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { resizeBackingStore } from './canvasDensity.js';

/**
 * The Print Preview's view of the PDF (7.6): pdf.js drawing **the file
 * itself**, the bytes that then go to the printer, not a second drawing of the
 * pattern. ADR 0019.
 *
 * Each document gets a worker of its own, from the bundled worker file — it
 * loads from app://leathercad under the app's content security policy in a
 * built app (R6) — and `doc.loadingTask.destroy()` ends
 * it with the document. A worker shared between documents cannot be: pdf.js
 * refuses a new document on a port while the last one is being destroyed.
 */
GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Opens the PDF, its worker ended when `signal` aborts — at once, though pdf.js
 * is still reading the file, so a load nobody will look at does not run on
 * (PERF-013) — or when pdf.js cannot read it. Rejects when either happens
 * before the document is open.
 */
export function openPdf(data: Uint8Array, signal: AbortSignal): Promise<PDFDocumentProxy> {
  // pdf.js moves the buffer it is given into its worker, which empties it
  // here. It gets a copy: the bytes it is shown are still the bytes printed.
  const task = getDocument({ data: data.slice() });
  const end = (): void => void task.destroy();
  if (signal.aborted) end();
  else signal.addEventListener('abort', end, { once: true });
  return task.promise.catch((error: unknown) => {
    // Aborted, it was ended already.
    if (!signal.aborted) end();
    throw error;
  });
}

/**
 * Runs at most `limit` of the tasks handed to it at once, the rest in the
 * order they came: the sheet list draws its pages a few at a time (PERF-013).
 */
export function limitConcurrency(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  if (!(limit >= 1)) throw new RangeError(`limit must be at least 1, not ${String(limit)}`);
  let running = 0;
  const waiting: Array<() => void> = [];
  return async (task) => {
    if (running < limit) running += 1;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      // The slot passes straight to the next in line, or is given back.
      const next = waiting.shift();
      if (next === undefined) running -= 1;
      else next();
    }
  };
}

/**
 * Draws one page (from 1) into a canvas `widthPx` CSS pixels wide, sharp at
 * the screen's density, its view turned `turn` degrees clockwise. Resolves
 * false if it was cancelled, which `signal` does when the canvas is about to
 * show something else.
 */
export async function drawPage(
  pdf: PDFDocumentProxy,
  number: number,
  canvas: HTMLCanvasElement,
  widthPx: number,
  dpr: number,
  signal: AbortSignal,
  turn = 0,
): Promise<boolean> {
  if (signal.aborted) return false;
  const page = await pdf.getPage(number);
  if (signal.aborted) return false;
  const rotation = (page.rotate + turn) % 360;
  const natural = page.getViewport({ scale: 1, rotation });
  const viewport = page.getViewport({
    scale: (widthPx / natural.width) * dpr,
    rotation,
  });
  resizeBackingStore(canvas, Math.round(viewport.width), Math.round(viewport.height));
  canvas.style.aspectRatio = `${String(natural.width)} / ${String(natural.height)}`;
  const task = page.render({ canvas, viewport });
  signal.addEventListener('abort', () => task.cancel());
  try {
    await task.promise;
    return true;
  } catch (error) {
    if (error instanceof RenderingCancelledException) return false;
    throw error;
  }
}
