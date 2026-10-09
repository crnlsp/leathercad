import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import { KeyCap } from './keyCaps.js';
import type { CommandId } from './keymap.js';
import { placeTooltip } from './tooltipPlacement.js';

/** How long a pointer rests on a control before its tooltip shows (R-10). */
const DELAY_MS = 500;

/**
 * A real tooltip: styled, delayed, and reachable from the keyboard.
 *
 * It replaces the native `title` (F.1), which is slow, unstyled, invisible to
 * keyboard users and absent on touch — and on a disabled control does not
 * appear at all, which is where the app most needed it. A disabled control
 * says why through `ReasonedButton` instead; this is for what an enabled one
 * does.
 *
 * Hover waits 500 ms so sweeping across the rail does not flicker; focus shows
 * at once, because someone tabbing has asked; Escape hides it wherever focus
 * is (R-10, WCAG 1.4.13). The text — and the control's key, as a cap after it,
 * from the keymap — is tied to the control with `aria-describedby`, so a
 * screen reader gets it too. Positioned against the window rather than the
 * control, so a panel that clips its overflow cannot cut it off: one line up
 * to 360 px, measured at that before it is placed, then turned above or
 * shifted to stay inside the window (`placeTooltip`).
 */
export function Tooltip({
  text,
  keys,
  children,
}: {
  /** Null shows nothing, so a caller can pass its hint unconditionally. */
  text: string | null;
  /** The command whose key the tooltip shows, as a cap after the text. */
  keys?: CommandId;
  children: ReactElement<{ 'aria-describedby'?: string }>;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [at, setAt] = useState<DOMRect | null>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A tooltip switched off — a menu's trigger while the menu is open — must not
  // come back with the position it had before, the moment it is switched on.
  // Reset while rendering rather than in an effect, React's pattern for state
  // that follows a prop: no extra pass, and nothing shown in between.
  if (text === null && at !== null) setAt(null);

  // Placed by the size it has at its widest, before it is painted.
  useLayoutEffect(() => {
    const node = bubble.current;
    if (node === null || at === null) return;
    const box = node.getBoundingClientRect();
    const placed = placeTooltip(at, box, { width: window.innerWidth, height: window.innerHeight });
    node.style.left = `${String(placed.left)}px`;
    node.style.top = `${String(placed.top)}px`;
  }, [at, text]);

  // Escape hides it wherever focus is: a tooltip shown by hover has none.
  useEffect(() => {
    if (at === null) return;
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      window.clearTimeout(timer.current);
      setAt(null);
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [at]);

  if (text === null) return children;

  const show = (): void => {
    const node = anchor.current;
    if (node === null) return;
    // Only while it is still asked for: pointed at, or holding keyboard focus.
    // A control whose content changes on a click — the legend's toggle (F.7) —
    // is sent a fresh pointer-enter as the old content goes, and the delayed
    // show then fired after the pointer had left.
    if (!node.matches(':hover') && node.querySelector(':focus-visible') === null) return;
    setAt(node.getBoundingClientRect());
  };
  const hide = (): void => {
    window.clearTimeout(timer.current);
    setAt(null);
  };

  return (
    <span
      ref={anchor}
      className="tooltip-anchor"
      onPointerEnter={() => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(show, DELAY_MS);
      }}
      onPointerLeave={hide}
      // Keyboard focus only: a mouse click also focuses the button, and a tip
      // that springs up under the pointer on every click is noise.
      onFocus={(event) => {
        if (event.target.matches(':focus-visible')) show();
      }}
      onBlur={hide}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        ref={bubble}
        role="tooltip"
        className="tooltip"
        data-testid="tooltip"
        hidden={at === null}
      >
        {/* Only while shown: hidden text would still match text queries and be
            read as page content. Focus shows it at once, so a screen reader
            gets the description when the control is reached. */}
        {at === null ? null : (
          <>
            {text}
            {keys !== undefined && (
              <>
                {' '}
                <KeyCap command={keys} />
              </>
            )}
          </>
        )}
      </span>
    </span>
  );
}
