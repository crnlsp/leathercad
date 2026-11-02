/** The browser's current display density, independent of CSS layout. */
export function pixelRatio(): number {
  return window.devicePixelRatio || 1;
}

/**
 * A resolution query changes when the window leaves its current density.
 * Re-arm against the new one so subsequent transitions, in either direction,
 * are observed too. The returned cleanup always removes the current listener.
 */
export function observePixelRatio(changed: () => void): () => void {
  let query = window.matchMedia(`(resolution: ${pixelRatio()}dppx)`);
  const onChange = (): void => {
    query.removeEventListener('change', onChange);
    query = window.matchMedia(`(resolution: ${pixelRatio()}dppx)`);
    query.addEventListener('change', onChange);
    changed();
  };
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Assigning even the same dimension clears the canvas and resets its context. */
export function resizeBackingStore(
  canvas: Pick<HTMLCanvasElement, 'width' | 'height'>,
  width: number,
  height: number,
): void {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}
