import { describeProblem, type Problem } from '@leathercad/domain';
import { useId, type ReactNode } from 'react';

import { Tooltip } from './Tooltip.js';

export interface ReasonedButtonProps {
  readonly children: ReactNode;
  /** Why it cannot act, from the same query the command checks. Null = enabled. */
  readonly reason: Problem | null;
  /** What it does, shown in a tooltip while it can. */
  readonly hint?: string;
  readonly onClick: () => void;
  readonly testId: string;
  readonly variant?: 'secondary' | 'destructive';
}

/**
 * A button that, when it cannot act, **says why** — beneath itself, in words.
 *
 * X1 says no refusal is silent, and the domain honours it: `flipRefusal`,
 * `mirrorRefusal`, `foldMirrorRefusal`, `allowanceRefusal` and `lockRefusal`
 * each return a `Problem`. The panel used to compute them and then hide the
 * sentence in a native `title` on a disabled element — slow, unstyled, absent
 * on touch, invisible to the keyboard, and on a disabled control often not
 * shown at all. A whole class of silent refusals the app did not know it had
 * (UI Foundations §6.5).
 *
 * The reason is the catalogue's own sentence, never a second wording, and it is
 * tied to the button with `aria-describedby`.
 */
export function ReasonedButton(props: ReasonedButtonProps) {
  const reasonId = useId();
  return (
    <span className="reasoned">
      <Button {...props} reasonId={reasonId} />
      {props.reason !== null && (
        <span id={reasonId} className="reason" data-testid={`${props.testId}-reason`}>
          {describeProblem(props.reason)}
        </span>
      )}
    </span>
  );
}

/**
 * Buttons that belong side by side, with their reasons beneath the row.
 *
 * A pair usually shares its reason — a label can be flipped neither way, for
 * one cause — so a reason is said once, however many buttons it disables.
 */
export function ReasonedRow({ buttons }: { buttons: readonly ReasonedButtonProps[] }) {
  const baseId = useId();
  const sentences = [
    ...new Set(buttons.flatMap((b) => (b.reason === null ? [] : [describeProblem(b.reason)]))),
  ];
  const idFor = (reason: Problem | null): string | undefined =>
    reason === null ? undefined : `${baseId}-${String(sentences.indexOf(describeProblem(reason)))}`;

  return (
    <div className="reasoned-row">
      <div className="toolbar">
        {buttons.map((button) => (
          <Button key={button.testId} {...button} reasonId={idFor(button.reason)} />
        ))}
      </div>
      {sentences.map((sentence, index) => (
        <span
          key={sentence}
          id={`${baseId}-${String(index)}`}
          className="reason"
          data-testid="reason"
        >
          {sentence}
        </span>
      ))}
    </div>
  );
}

function Button({
  children,
  reason,
  hint,
  onClick,
  testId,
  variant = 'secondary',
  reasonId,
}: ReasonedButtonProps & { reasonId: string | undefined }) {
  return (
    <Tooltip text={reason === null ? (hint ?? null) : null}>
      <button
        type="button"
        className={variant === 'destructive' ? 'tool danger' : 'tool'}
        data-testid={testId}
        disabled={reason !== null}
        aria-describedby={reason === null ? undefined : reasonId}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  );
}
