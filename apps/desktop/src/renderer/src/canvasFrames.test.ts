import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasFrames } from './canvasFrames.js';

const pending = new Map<number, FrameRequestCallback>();
let nextId = 0;
const request = vi.fn((callback: FrameRequestCallback) => {
  const id = nextId++;
  pending.set(id, callback);
  return id;
});
const cancel = vi.fn((id: number) => pending.delete(id));

/** Only callbacks already queued run this frame; new ones wait for the next. */
function frame(): void {
  const callbacks = [...pending.values()];
  pending.clear();
  for (const callback of callbacks) callback(0);
}

beforeEach(() => {
  pending.clear();
  nextId = 0;
  request.mockClear();
  cancel.mockClear();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
});
afterEach(() => vi.unstubAllGlobals());

describe('canvas frames (PERF-014)', () => {
  it('coalesces a burst into one paint, then stops asking for idle callbacks', () => {
    const frames = new CanvasFrames();
    const paint = vi.fn();
    frames.start(paint);
    for (let i = 0; i < 100; i++) frames.invalidate();
    expect(pending.size).toBe(1);
    frame();
    for (let i = 0; i < 100; i++) frame();
    expect(paint).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(0);
  });

  it('wakes up again for a later change after becoming idle', () => {
    const frames = new CanvasFrames();
    const paint = vi.fn();
    frames.start(paint);
    frame();
    frames.invalidate();
    frames.invalidate();
    frame();
    expect(paint).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(2);
    expect(pending.size).toBe(0);
  });

  it('paints first display, resize and view changes immediately, cancelling the pending paint', () => {
    const frames = new CanvasFrames();
    const paint = vi.fn();
    frames.start(paint);
    frames.paintNow();
    expect(paint).toHaveBeenCalledTimes(1);
    // Zero is a valid request handle and must be cancelled too.
    expect(cancel).toHaveBeenCalledWith(0);
    frame();
    expect(paint).toHaveBeenCalledTimes(1);
    frames.paintNow();
    expect(paint).toHaveBeenCalledTimes(2);
    expect(pending.size).toBe(0);
  });

  it('preserves an invalidation raised while painting for exactly one following frame', () => {
    const frames = new CanvasFrames();
    const paint = vi.fn().mockImplementationOnce(() => {
      frames.invalidate();
      frames.invalidate();
    });
    frames.start(paint);
    frame();
    expect(pending.size).toBe(1);
    frame();
    expect(paint).toHaveBeenCalledTimes(2);
    expect(pending.size).toBe(0);
  });

  it('keeps an invalidation raised during a synchronous paint too', () => {
    const frames = new CanvasFrames();
    const paint = vi.fn().mockImplementationOnce(() => frames.invalidate());
    frames.start(paint);
    frames.paintNow();
    expect(pending.size).toBe(1);
    frame();
    expect(paint).toHaveBeenCalledTimes(2);
    expect(pending.size).toBe(0);
  });

  it('cancels unmount work and ignores late invalidations, such as font loading', () => {
    const frames = new CanvasFrames();
    const paint = vi.fn();
    const stop = frames.start(paint);
    stop();
    frames.invalidate();
    frames.paintNow();
    frame();
    expect(paint).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(0);
  });

  it('uses the current painter when an effect reconnects, including initial invalidations', () => {
    const frames = new CanvasFrames();
    const old = vi.fn();
    const current = vi.fn();
    frames.invalidate();
    expect(pending.size).toBe(0);
    frames.start(old)();
    frames.start(current);
    frame();
    expect(old).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(0);
  });

  it('releases the frame slot even when painting throws, without swallowing the error', () => {
    const frames = new CanvasFrames();
    const paint = vi.fn().mockImplementationOnce(() => {
      throw new Error('paint failed');
    });
    frames.start(paint);
    expect(frame).toThrow('paint failed');
    frames.invalidate();
    frame();
    expect(paint).toHaveBeenCalledTimes(2);
    expect(pending.size).toBe(0);
  });
});
