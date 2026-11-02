import { useState } from 'react';

import { Icon } from './icons/Icon.js';

/**
 * A turning circle: something was asked and the answer is not in yet. Words
 * beside it say what; this only shows that the press was heard.
 */
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span className="spinner" data-testid="spinner">
      <Icon of="spinner" size={size} />
    </span>
  );
}

// A check that fails at once would flash the spinner too briefly to be seen.
const AT_LEAST_MS = 400;

/**
 * Whether a check for updates is running, and how to start one. It runs at
 * least long enough for its spinner to be seen, and never twice at once.
 */
export function useChecking(check: () => Promise<void>): [boolean, () => void] {
  const [checking, setChecking] = useState(false);
  const start = () => {
    if (checking) return;
    setChecking(true);
    const shown = new Promise<void>((resolve) => setTimeout(resolve, AT_LEAST_MS));
    void Promise.allSettled([check(), shown]).then(() => setChecking(false));
  };
  return [checking, start];
}
