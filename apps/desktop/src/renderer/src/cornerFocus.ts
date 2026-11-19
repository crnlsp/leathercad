import { useEffect, useMemo } from 'react';

import { PointerValue } from './pointerValue.js';

/**
 * The feature whose corners the board numbers (Q48): set while a field that
 * names corners — *Stitched sides*' corners, *Sew together…*'s — has focus.
 * One per window, as the board is.
 */
export const cornerFocus = new PointerValue<string | null>(null);

/** Focus and blur handlers for a corner field naming `featureId`'s corners; cleared on unmount. */
export function useCornerFocus(featureId: string) {
  useEffect(
    () => () => {
      if (cornerFocus.get() === featureId) cornerFocus.set(null);
    },
    [featureId],
  );
  return useMemo(
    () => ({
      onFocus: () => cornerFocus.set(featureId),
      onBlur: () => {
        if (cornerFocus.get() === featureId) cornerFocus.set(null);
      },
    }),
    [featureId],
  );
}
