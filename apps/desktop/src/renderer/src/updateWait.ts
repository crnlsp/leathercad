import type { UpdateStatus } from '@leathercad/platform';
import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/**
 * How many minutes, rounded up, until a press may ask for updates again
 * (8.9): null when it may now. Only an answer waits — a failed check, or none
 * yet, can be asked again at once.
 */
export function minutesUntilAgain(status: UpdateStatus, now: number): number | null {
  if (status.state !== 'current' && status.state !== 'available') return null;
  // A clock read before the answer came counts from the answer: never more
  // than the five minutes it gives.
  const left = status.againAt - Math.max(now, status.checkedAt);
  return left > 0 ? Math.ceil(left / MINUTE_MS) : null;
}

/**
 * `minutesUntilAgain`, kept current: the component re-renders as each minute
 * runs out, and once more when the wait is over and its button wakes.
 */
export function useMinutesUntilAgain(status: UpdateStatus): number | null {
  const [now, setNow] = useState(() => Date.now());
  const minutes = minutesUntilAgain(status, now);
  const againAt = 'againAt' in status ? status.againAt : null;
  const waiting = minutes !== null;
  useEffect(() => {
    if (!waiting || againAt === null) return;
    // To the next whole minute left, when the number shown changes; at once
    // if the wait is already over.
    const left = againAt - Date.now();
    const delay = left <= 0 ? 0 : (left % MINUTE_MS || MINUTE_MS) + 20;
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [waiting, againAt, now]);
  return minutes;
}
