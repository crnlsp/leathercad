import { useLayoutEffect, useRef, useState } from 'react';

import { useI18n } from './i18n.js';
import { useKeyLabel } from './keyCaps.js';
import { fitHints, type Hint } from './optionHints.js';

/**
 * The work bar's hints (U.11, R-11): a key as a cap and a few words each, as many as
 * the bar has room for, the lowest-ranked going first as it narrows and "?
 * all keys" never.
 *
 * Which fit is `fitHints`'s, from the width each hint takes as it is drawn —
 * measured in a copy that is never seen, since a hint that is not shown has no
 * width to read — and the room the row has, which the window's width and the
 * tool's own options decide. So a hint is whole or not there: nothing is cut
 * short by the edge. The copy is hidden from assistive technology; the row is
 * the only one it reads.
 */
export function OptionHints({ hints, testId }: { hints: readonly Hint[]; testId: string }) {
  const { t } = useI18n();
  const label = useKeyLabel();
  const slotRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLUListElement>(null);
  /** Which hints are shown; every one until the first measure, which comes before the first paint. */
  const [kept, setKept] = useState<readonly boolean[] | null>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const copy = copyRef.current;
    if (slot === null || copy === null) return;
    const fit = (): void => {
      // Rounded outwards, so the sum of what is kept can never exceed the room.
      const sizes = [...copy.children].map((child, index) => ({
        width: Math.ceil(child.getBoundingClientRect().width),
        rank: hints[index]?.rank ?? 0,
      }));
      const gap = Number.parseFloat(getComputedStyle(copy).columnGap) || 0;
      const next = fitHints(sizes, Math.floor(slot.getBoundingClientRect().width), gap);
      setKept((previous) =>
        previous?.length === next.length && previous.every((was, i) => was === next[i])
          ? previous
          : next,
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(slot);
    return () => observer.disconnect();
    // The words and the keys' labels are what a hint's width is made of.
  }, [hints, t, label]);

  const item = (hint: Hint) => (
    <li key={hint.words} className="work-hint" data-hint={hint.words}>
      {hint.key !== undefined && <kbd>{label(hint.key)}</kbd>}
      {/* Dropped by the layout, kept for the words a screen reader and a copy read. */}{' '}
      {t(hint.words)}
    </li>
  );

  return (
    <div className="work-hints" ref={slotRef}>
      <ul className="work-hints-row" data-testid={testId}>
        {hints.filter((_, index) => kept?.[index] ?? true).map(item)}
      </ul>
      <ul className="work-hints-row work-hints-copy" ref={copyRef} aria-hidden="true">
        {hints.map(item)}
      </ul>
    </div>
  );
}
