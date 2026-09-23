import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from 'react';

/** How long a pointer rests on a control before its tooltip shows (UI Foundations §6.6). */
const DELAY_MS = 400;

/** Kept clear of the window edge, so a tooltip in the right-hand panel stays readable. */
const MARGIN_PX = 8;

/**
 * A real tooltip: styled, delayed, and reachable from the keyboard.
 *
 * It replaces the native `title` (F.1), which is slow, unstyled, invisible to
 * keyboard users and absent on touch — and on a disabled control does not
 * appear at all, which is where the app most needed it. A disabled control
 * says why through `ReasonedButton` instead; this is for what an enabled one
 * does.
 *
 * Hover waits 400 ms so sweeping across the rail does not flicker; focus shows
 * at once, because someone tabbing has asked. The text is tied to the control
 * with `aria-describedby`, so a screen reader gets it too. Positioned against
 * the window rather than the control, so a panel that clips its overflow
 * cannot cut it off.
 */
export function Tooltip({
  text,
  children,
}: {
  /** Null shows nothing, so a caller can pass its hint unconditionally. */
  text: string | null;
  children: ReactElement<{ 'aria-describedby'?: string }>;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A tooltip switched off — a menu's trigger while the menu is open — must not
  // come back with the position it had before, the moment it is switched on.
  // Reset while rendering rather than in an effect, React's pattern for state
  // that follows a prop: no extra pass, and nothing shown in between.
  if (text === null && at !== null) setAt(null);

  if (text === null) return children;

  const show = (): void => {
    const box = anchor.current?.getBoundingClientRect();
    if (box === undefined) return;
    setAt({ left: box.left, top: box.bottom + 4 });
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
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide();
      }}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        className="tooltip"
        data-testid="tooltip"
        hidden={at === null}
        ref={(bubble) => {
          // Clamped once it has a size, so it never runs off the window.
          if (bubble === null || at === null) return;
          const width = bubble.offsetWidth;
          const left = Math.min(at.left, window.innerWidth - width - MARGIN_PX);
          bubble.style.left = `${Math.max(MARGIN_PX, left)}px`;
          bubble.style.top = `${at.top}px`;
        }}
      >
        {/* Only while shown: hidden text would still match text queries and be
            read as page content. Focus shows it at once, so a screen reader
            gets the description when the control is reached. */}
        {at === null ? null : text}
      </span>
    </span>
  );
}
