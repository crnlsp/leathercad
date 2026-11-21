import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';

import type { I18n } from '../../shared/i18n.js';
import { useI18n } from './i18n.js';
import { MessageDialog } from './MessageDialog.js';

/**
 * A part of the window that may fail to draw without taking the rest with it
 * (QA2). The board and each panel say so in their place; a dialog says so in
 * a dialog of its own, which closes it. Save, Undo and the tabs are outside
 * every area, so they stay reachable.
 */
export type FailingArea = 'board' | 'panel' | 'dialog';

/**
 * The event e2e sends to make an area throw as it draws, its detail the
 * area's `testArea`. Nothing in the app sends it: without a test driving the
 * window, `FailOnRequest` renders nothing.
 */
const FAIL_EVENT = 'leathercad:fail-render';

/**
 * Catches a render error in its children (QA2): the area shows a short notice
 * instead, and the rest of the window keeps working. The document is outside
 * React, in its own store, so nothing of the work goes with the area.
 *
 * It draws again when one of `retryOn` changes — a new document after Undo,
 * another selection, another tab — so the maker's next step brings the area
 * back if that step made it drawable.
 */
export class AreaBoundary extends Component<
  {
    area: FailingArea;
    /** Names the area for e2e's failure hook, and for the notice's test id. */
    testArea: string;
    retryOn: readonly unknown[];
    /** A dialog's own close: its notice's Close takes the dialog away. */
    onClose?: () => void;
    children: ReactNode;
  },
  { failed: boolean; retryOn: readonly unknown[] }
> {
  override state = { failed: false, retryOn: this.props.retryOn };

  static getDerivedStateFromError(): Partial<{ failed: boolean }> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { retryOn: readonly unknown[] },
    state: { failed: boolean; retryOn: readonly unknown[] },
  ): { failed: boolean; retryOn: readonly unknown[] } | null {
    const same =
      props.retryOn.length === state.retryOn.length &&
      props.retryOn.every((value, i) => Object.is(value, state.retryOn[i]));
    return same ? null : { failed: false, retryOn: props.retryOn };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // To the log, through the console the main process records (ADR 0015).
    console.error(`the ${this.props.testArea} failed to draw:`, error, info.componentStack);
  }

  override render(): ReactNode {
    const { area, testArea, onClose, children } = this.props;
    if (!this.state.failed) {
      return (
        <>
          {children}
          <FailOnRequest area={testArea} />
        </>
      );
    }
    return <AreaNotice area={area} testArea={testArea} onClose={onClose} />;
  }
}

function AreaNotice({
  area,
  testArea,
  onClose,
}: {
  area: FailingArea;
  testArea: string;
  onClose: (() => void) | undefined;
}) {
  const { t } = useI18n();
  if (area === 'dialog') {
    return (
      <MessageDialog
        title={t('failure.dialogTitle')}
        testId={`failure-${testArea}`}
        onClose={onClose ?? (() => undefined)}
      >
        <p>{t('failure.dialog')}</p>
      </MessageDialog>
    );
  }
  return (
    <p className="failure-notice" role="alert" data-testid={`failure-${testArea}`}>
      {t(area === 'board' ? 'failure.board' : 'failure.panel')}
    </p>
  );
}

/**
 * The last resort (QA2): the whole interface failed to draw. The window shows
 * only this, its unsaved-changes question gone with the interface, so the main
 * process is told, and keeps the session's recovery copies through the quit
 * that follows; the next start offers them. The window's own tabs wrote their
 * latest copies as they unmounted (`useRecovery`).
 *
 * Outside the app's language provider, which failed with it: it is given the
 * words the window started in.
 */
export class WindowBoundary extends Component<
  { i18n: I18n; onFailed: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('the window failed to draw:', error, info.componentStack);
    this.props.onFailed();
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      return (
        <>
          {this.props.children}
          <FailOnRequest area="window" />
        </>
      );
    }
    const { t } = this.props.i18n;
    return (
      <main className="window-failure" data-testid="failure-window">
        <h1>{t('failure.windowTitle')}</h1>
        <p role="alert">{t('failure.window')}</p>
      </main>
    );
  }
}

/** Throws as it draws once e2e asks for `area` with `FAIL_EVENT`; otherwise nothing. */
function FailOnRequest({ area }: { area: string }) {
  const [failing, setFailing] = useState(false);
  useEffect(() => {
    const listener = (event: Event): void => {
      if (event instanceof CustomEvent && event.detail === area) setFailing(true);
    };
    window.addEventListener(FAIL_EVENT, listener);
    return () => window.removeEventListener(FAIL_EVENT, listener);
  }, [area]);
  if (failing) throw new Error(`asked to fail: ${area}`);
  return null;
}
