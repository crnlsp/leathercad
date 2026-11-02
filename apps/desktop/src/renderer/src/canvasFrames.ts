/** One pending frame is the board's dirty state; a clean board schedules nothing. */
export class CanvasFrames {
  private paint: (() => void) | null = null;
  private pending: number | null = null;

  /** The effect owns the painter, so late invalidations after cleanup do nothing. */
  start(paint: () => void): () => void {
    this.paint = paint;
    this.invalidate();
    return () => {
      this.cancelPending();
      this.paint = null;
    };
  }

  invalidate(): void {
    if (this.paint === null || this.pending !== null) return;
    this.pending = requestAnimationFrame(() => {
      // Release first: a change raised while painting needs another frame.
      this.pending = null;
      this.paint?.();
    });
  }

  /** First/resize, view changes and typed-chip focus must not wait for a frame. */
  paintNow(): void {
    this.cancelPending();
    this.paint?.();
  }

  private cancelPending(): void {
    if (this.pending !== null) cancelAnimationFrame(this.pending);
    this.pending = null;
  }
}
