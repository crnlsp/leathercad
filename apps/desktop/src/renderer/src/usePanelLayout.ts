import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import type { Preferences } from '@leathercad/platform';

import { IS_MAC } from './keyCaps.js';
import { keysOf, matches } from './keymap.js';
import type { Press } from './PanelFold.js';
import { ROOM_PX, layoutFor, toggleOf, type Panel, type Room } from './panelLayout.js';
import { isTyping } from './shortcuts.js';
import { useMediaQuery } from './useMediaQuery.js';

/**
 * The frame's panels as the window and the maker have them (U.5, R-04): the
 * room the window gives, the rail, Parts and Properties folded or not, focus
 * mode, and a panel opened over the board. What each panel's shape is follows
 * from `layoutFor` in `panelLayout.ts`; this holds the state it reads, and the
 * focus and keys that go with it.
 */
export function usePanelLayout(
  preferences: Pick<Preferences, 'toolRailCollapsed' | 'partsFolded' | 'propertiesFolded'>,
  changePreferences: (asked: Partial<Preferences>) => void,
) {
  // The frame gives the board its room in §5's order (U.5): below 1280 px
  // the rail drops its names and Properties folds to a strip; below 900 Parts
  // leaves its column too. The maker's own folds are remembered, and the
  // window's never overwrite them. Opening the rail while narrow lasts the
  // session: it answers the window being small, not a liking.
  const narrow = useMediaQuery(`(max-width: ${String(ROOM_PX.wide - 1)}px)`);
  const cramped = useMediaQuery(`(max-width: ${String(ROOM_PX.narrow - 1)}px)`);
  const room: Room = cramped ? 'cramped' : narrow ? 'narrow' : 'wide';
  const [railExpandedWhileNarrow, setRailExpandedWhileNarrow] = useState(false);
  // Focus mode (`\`): both panels hide and the rail shows keys only, until `\`
  // or Esc. Nothing the maker chose changes, so leaving it restores exactly
  // what was there. For the session, like the view.
  const [focus, setFocus] = useState(false);
  const layout = layoutFor(
    room,
    {
      railCollapsed: preferences.toolRailCollapsed,
      railExpandedWhileNarrow,
      partsFolded: preferences.partsFolded,
      propertiesFolded: preferences.propertiesFolded,
    },
    focus,
  );
  const toggleRail = useCallback(() => {
    if (room !== 'wide') {
      setRailExpandedWhileNarrow((expanded) => !expanded);
      return;
    }
    changePreferences({ toolRailCollapsed: !preferences.toolRailCollapsed });
  }, [room, changePreferences, preferences.toolRailCollapsed]);

  // A panel opened over the board — from its strip, its chip or its key —
  // where it has no column (R-04). It takes focus, and gives it back to what
  // had it when the keyboard closes it; a press on the board closes it and
  // leaves focus where the press put it (U.4's rule). One at a time. A change
  // of room or of focus mode closes it: the panel may have its column now.
  const [overlay, setOverlay] = useState<{
    readonly panel: Panel;
    readonly opener: HTMLElement | null;
  } | null>(null);
  const [overlayIn, setOverlayIn] = useState(`${room} ${String(focus)}`);
  if (overlayIn !== `${room} ${String(focus)}`) {
    setOverlayIn(`${room} ${String(focus)}`);
    setOverlay(null);
  }
  const open = overlay?.panel ?? null;
  const closeOverlay = useCallback(
    (press: Press) => {
      if (press === 'keyboard') overlay?.opener?.focus();
      setOverlay(null);
    },
    [overlay],
  );
  // The panel itself takes focus, not its first button: a button would take
  // the Enter that finishes a polyline. Tab goes on into it, and out of it.
  useEffect(() => {
    if (open !== null) document.querySelector<HTMLElement>(`.panel.${open}`)?.focus();
  }, [open]);

  // A toggle that folds or unfolds its own panel goes with it: from the
  // keyboard, focus follows to the panel's toggle in its new shape.
  const followToggle = useRef<Panel | null>(null);
  const togglePanel = useCallback(
    (panel: Panel, press: Press, fromToggle = false) => {
      if (toggleOf(panel, room, focus) === 'overlay') {
        if (open === panel) closeOverlay(press);
        else {
          const active = document.activeElement;
          setOverlay({ panel, opener: active instanceof HTMLElement ? active : null });
        }
        return;
      }
      if (fromToggle && press === 'keyboard') followToggle.current = panel;
      changePreferences(
        panel === 'parts'
          ? { partsFolded: !preferences.partsFolded }
          : { propertiesFolded: !preferences.propertiesFolded },
      );
    },
    [
      room,
      focus,
      open,
      closeOverlay,
      changePreferences,
      preferences.partsFolded,
      preferences.propertiesFolded,
    ],
  );
  useEffect(() => {
    const panel = followToggle.current;
    followToggle.current = null;
    if (panel === null) return;
    [...document.querySelectorAll<HTMLElement>(`[data-panel-toggle="${panel}"]`)]
      .find((toggle) => toggle.getClientRects().length > 0)
      ?.focus();
  }, [layout.parts, layout.properties]);
  // Esc closes an overlay from inside it before anything behind it hears the
  // key. A menu open in it, or a field being typed in, keeps Esc for itself.
  const overlayKeys = (panel: Panel) => (event: ReactKeyboardEvent) => {
    if (open !== panel || isTyping(event.target)) return;
    if (!keysOf('cancel').some((binding) => matches(event, binding, IS_MAC))) return;
    event.stopPropagation();
    event.preventDefault();
    closeOverlay('keyboard');
  };

  return {
    room,
    layout,
    focus,
    setFocus,
    toggleRail,
    open,
    closeOverlay,
    togglePanel,
    overlayKeys,
  };
}
