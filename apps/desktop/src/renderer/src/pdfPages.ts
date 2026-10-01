import {
  GlobalWorkerOptions,
  RenderingCancelledException,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * The Print Preview's view of the PDF (7.6): pdf.js drawing **the file
 * itself**, the bytes that then go to the printer, not a second drawing of the
 * pattern. ADR 0019.
 *
 * Each document gets a worker of its own, from the bundled worker file — it
 * loads from file:// under the app's content security policy, proved in
 * Electron 44 before this was written — and `doc.loadingTask.destroy()` ends
 * it with the document. A worker shared between documents cannot be: pdf.js
 * refuses a new document on a port while the last one is being destroyed.
 */
GlobalWorkerOptions.workerSrc = workerUrl;

export function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  // pdf.js moves the buffer it is given into its worker, which empties it
  // here. It gets a copy: the bytes it is shown are still the bytes printed.
  return getDocument({ data: data.slice() }).promise;
}

/**
 * Draws one page (from 1) into a canvas `widthPx` CSS pixels wide, sharp at
 * the screen's density. Resolves false if it was cancelled, which `signal`
 * does when the canvas is about to show something else.
 */
export async function drawPage(
  pdf: PDFDocumentProxy,
  number: number,
  canvas: HTMLCanvasElement,
  widthPx: number,
  signal: AbortSignal,
): Promise<boolean> {
  const page = await pdf.getPage(number);
  if (signal.aborted) return false;
  const natural = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({
    scale: (widthPx / natural.width) * window.devicePixelRatio,
  });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
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
