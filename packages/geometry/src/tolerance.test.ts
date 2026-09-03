import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ARC_CUBIC_ERROR_COEFFICIENT,
  EXPORT_TOLERANCE_MM,
  SCREEN_TOLERANCE_MM,
  maxArcStepForTolerance,
} from './tolerance.js';

describe('tolerance constants', () => {
  it('keeps export well below a printer dot and screen well above it', () => {
    // 600 dpi is 42 µm. Export must be invisible; screen may be coarse.
    expect(EXPORT_TOLERANCE_MM).toBeLessThan(0.042);
    expect(SCREEN_TOLERANCE_MM).toBeGreaterThan(EXPORT_TOLERANCE_MM);
  });
});

describe('maxArcStepForTolerance', () => {
  it('never exceeds a quarter turn', () => {
    // Beyond that the 4/3·tan(θ/4) handle grows without bound.
    fc.assert(
      fc.property(
        fc.double({ min: 0.001, max: 5000, noNaN: true }),
        fc.double({ min: 1e-6, max: 10, noNaN: true }),
        (radius, tolerance) => maxArcStepForTolerance(radius, tolerance) <= Math.PI / 2 + 1e-12,
      ),
    );
  });

  it('shrinks as the radius grows', () => {
    // Absolute error scales with radius, so a bigger arc needs finer steps.
    const small = maxArcStepForTolerance(1, EXPORT_TOLERANCE_MM);
    const large = maxArcStepForTolerance(1000, EXPORT_TOLERANCE_MM);
    expect(large).toBeLessThan(small);
  });

  it('shrinks as the tolerance tightens', () => {
    expect(maxArcStepForTolerance(100, 1e-5)).toBeLessThan(maxArcStepForTolerance(100, 1e-2));
  });

  it('predicts the measured error to within a few percent', () => {
    // The coefficient was fitted empirically; this guards it against drift.
    // error = k · r · θ⁶, so at the returned step the error should land on
    // the tolerance itself.
    for (const radius of [1, 10, 100, 1000]) {
      const step = maxArcStepForTolerance(radius, EXPORT_TOLERANCE_MM);
      if (step >= Math.PI / 2 - 1e-9) continue; // clamped, not tolerance-driven
      const predicted = ARC_CUBIC_ERROR_COEFFICIENT * radius * step ** 6;
      expect(Math.abs(predicted - EXPORT_TOLERANCE_MM)).toBeLessThan(EXPORT_TOLERANCE_MM * 0.01);
    }
  });

  it('degrades safely for nonsense input', () => {
    expect(maxArcStepForTolerance(0, 0.005)).toBe(Math.PI / 2);
    expect(maxArcStepForTolerance(-5, 0.005)).toBe(Math.PI / 2);
    expect(maxArcStepForTolerance(10, 0)).toBe(Math.PI / 2);
  });
});
