import { QUANTUM_MM, quantise } from '@leathercad/core';
import * as D from '@leathercad/document';
import { evaluate } from '@leathercad/domain';
import { cornerRoom, fittedRadii, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import {
  chipCommand,
  chipNumber,
  chipRefusal,
  chipSubject,
  chipsOf,
  chipValue,
  cornerRefusal,
  type ChipSubject,
} from './outlineSizes.js';

/**
 * U.14, R-12: the sizes a selected outline shows beside it on the board — what
 * they are, the one command each typed value is, and the corner refused when
 * the rectangle would draw it smaller than typed.
 */

const { t } = createI18n('en');
const words = { t, enter: 'Enter' };

/** An 80 × 60 piece, 4 mm corners, with a stitch line 3.5 mm in. */
function store(): D.DocumentStore {
  const s = new D.DocumentStore(D.emptyDocument('doc'));
  s.dispatch(
    D.addPart(D.rectanglePart('part', 'outline', 'Panel', D.rectShape({ x: 0, y: 0 }, 80, 60, 4))),
  );
  s.dispatch(D.addStitchLine('part', 'stitch', 'outline', 3.5));
  s.select(['outline']);
  return s;
}

const subjectOf = (s: D.DocumentStore): ChipSubject => {
  const { document, selection } = s.getState();
  return chipSubject(document.project, selection)!;
};

describe('chipSubject', () => {
  it('is a selected outline drawn as a rectangle, with the stitch line that follows it', () => {
    const subject = subjectOf(store());
    expect(subject.outlineId).toBe('outline');
    expect(subject.margin?.id).toBe('stitch');
    expect(chipsOf(subject)).toEqual(['width', 'height', 'corner', 'margin']);
  });

  it('has no margin chip without exactly one stitch line following the outline', () => {
    const s = store();
    s.dispatch(D.addStitchLine('part', 'second', 'outline', 6));
    s.select(['outline']);
    expect(subjectOf(s).margin).toBeNull();
    expect(chipsOf(subjectOf(s))).toEqual(['width', 'height', 'corner']);
  });

  it('is nothing for a stitch line, two features, a piece picked by its heading, or a locked outline', () => {
    const s = store();
    const project = s.getState().document.project;
    expect(chipSubject(project, D.selectionOf(['stitch']))).toBeNull();
    expect(chipSubject(project, D.selectionOf(['outline', 'stitch']))).toBeNull();
    expect(chipSubject(project, D.partSelectionOf(['part']))).toBeNull();
    s.dispatch(D.setFeatureLocked(['outline'], true));
    expect(chipSubject(s.getState().document.project, D.selectionOf(['outline']))).toBeNull();
  });
});

describe('chipValue', () => {
  it('reads the width, height, corner and margin', () => {
    const subject = subjectOf(store());
    expect(
      ['width', 'height', 'corner', 'margin'].map((c) => chipValue(subject, c as never)),
    ).toEqual([80, 60, 4, 3.5]);
  });

  it('reads no corner when the four differ: the chip says they are mixed', () => {
    const subject = subjectOf(store());
    const mixed = {
      ...subject,
      shape: { ...subject.shape, radii: { ...subject.shape.radii, topLeft: 6 } },
    };
    expect(chipValue(mixed, 'corner')).toBeNull();
  });
});

describe('chipCommand', () => {
  it('is one undo step for each value applied', () => {
    const s = store();
    for (const [chip, value] of [
      ['width', 95],
      ['height', 40],
      ['corner', 8],
      ['margin', 4],
    ] as const) {
      const before = s.getState().document;
      s.dispatch(chipCommand(subjectOf(s), chip, value));
      expect(chipValue(subjectOf(s), chip)).toBe(value);
      s.undo();
      expect(s.getState().document).toBe(before);
      s.redo();
    }
    expect(s.getState().undoLabel).toEqual({ action: 'edit-derivation' });
  });

  it('sets all four corners at once, mixed or not', () => {
    const s = store();
    s.dispatch(chipCommand(subjectOf(s), 'corner', 5));
    expect(subjectOf(s).shape.radii).toEqual(uniformRadii(5));
  });

  it('reshapes the outline alone: a new width does not move the piece', () => {
    const s = store();
    s.dispatch(chipCommand(subjectOf(s), 'width', 120));
    expect(subjectOf(s).shape.origin).toEqual({ x: 0, y: 0 });
    // The stitch line follows the new edge.
    const stitch = evaluate(s.getState().document.project).parts[0]!.features.find(
      (entry) => entry.feature.id === 'stitch',
    )!;
    expect(stitch.ok).toBe(true);
  });
});

describe('chipRefusal', () => {
  it('refuses a corner larger than half the height, offering the half', () => {
    const subject = subjectOf(store());
    expect(chipRefusal(subject, 'corner', 48, words)).toEqual({
      reason: 'Corner is larger than half the height (30.0). Enter uses 30.0.',
      use: 30,
    });
    expect(chipRefusal(subject, 'corner', 30, words)).toBeNull();
    expect(chipRefusal(subject, 'width', 1000, words)).toBeNull();
  });

  it('refuses exactly what the rectangle would draw smaller than typed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        (w, h, r) => {
          const [width, height, radius] = [w, h, r].map((n) => quantise(n * QUANTUM_MM));
          const subject = subjectOf(store());
          const shaped = {
            ...subject,
            shape: { ...subject.shape, width: width!, height: height! },
          };
          const refusal = chipRefusal(shaped, 'corner', radius!, words);
          const drawn = fittedRadii(uniformRadii(radius!), width!, height!).topRight;
          // Refused if and only if it would be drawn smaller than typed; the
          // radius offered is on the storage grid and drawn as it is.
          if (refusal === null) return Math.abs(drawn - radius!) < 1e-9;
          return (
            drawn < radius! &&
            quantise(refusal.use) === refusal.use &&
            Math.abs(
              fittedRadii(uniformRadii(refusal.use), width!, height!).topRight - refusal.use,
            ) < 1e-9
          );
        },
      ),
    );
  });
});

describe('cornerRefusal', () => {
  it('says a single corner is larger than what the side leaves it', () => {
    const room = cornerRoom(80, 60, { bottomLeft: 10, bottomRight: 4, topRight: 5, topLeft: 0 }, [
      'bottomRight',
    ]);
    expect(cornerRefusal(room, 56, words)?.reason).toBe(
      'Corner is larger than the height leaves it (55.0). Enter uses 55.0.',
    );
    expect(cornerRefusal(room, 55, words)).toBeNull();
  });

  it('names the key it is given, not one of its own', () => {
    const room = cornerRoom(80, 60, uniformRadii(0), [
      'topLeft',
      'topRight',
      'bottomLeft',
      'bottomRight',
    ]);
    expect(cornerRefusal(room, 31, { t, enter: '↩' })?.reason).toContain('↩ uses 30.0');
  });
});

describe('chipNumber', () => {
  it('shows a size to the tenth, or to the hundredth when it was typed so', () => {
    expect(chipNumber(95)).toBe('95.0');
    expect(chipNumber(3.5)).toBe('3.5');
    expect(chipNumber(95.25)).toBe('95.25');
    expect(chipNumber(3.175)).toBe('3.18');
  });
});
