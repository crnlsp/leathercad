import type { Page } from '@playwright/test';

/** Count browser frame callbacks and actual board paints without waking the board. */
export async function installFrameCounter(window: Page) {
  return window.evaluateHandle(() => {
    const counts = { callbacks: 0, paints: 0 };
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      request((time) => {
        counts.callbacks += 1;
        callback(time);
      });
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.getAttribute('data-testid') === 'editor-canvas') counts.paints += 1;
      return clear.apply(this, args);
    };
    return counts;
  });
}
