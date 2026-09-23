import type { ExportReadiness } from '@leathercad/domain';
import { useEffect, useRef } from 'react';

/**
 * What the maker should know about the template they just exported.
 *
 * **Nothing blocked it.** A pattern with a warning on it is still a pattern
 * someone may want on paper, and a tool that refuses to print because a hole is
 * 1.4 mm from an edge gets worked around within a day — by exporting from a
 * copy with the hole moved, which is worse than printing the warning. The PDF
 * is written and open by the time this appears.
 *
 * Two facts, kept apart because they are not the same fact:
 *
 * - **rules broken**, which are on the paper and can be looked at; and
 * - **features missing**, which are not on the paper at all. A maker cutting
 *   from a template has no way to know a piece was ever meant to be there, so
 *   this is the half that is named feature by feature rather than counted.
 *
 * Everything here comes from `exportReadiness`. This file decides no severity,
 * counts nothing, and cannot disagree with what the exporter drew.
 */
export function ExportNotice({
  readiness,
  onClose,
}: {
  readiness: ExportReadiness;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const counts = [
    readiness.errors === 0
      ? null
      : `${String(readiness.errors)} ${plural(readiness.errors, 'error')}`,
    readiness.warnings === 0
      ? null
      : `${String(readiness.warnings)} ${plural(readiness.warnings, 'warning')}`,
    readiness.infos === 0 ? null : `${String(readiness.infos)} to note`,
  ].filter((part): part is string => part !== null);

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-notice-title"
        data-testid="export-notice"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
      >
        <h3 id="export-notice-title">Exported, with something to check</h3>

        {readiness.omitted.length > 0 && (
          <section className="dialog-group" data-testid="export-omitted">
            <p>
              <b>
                {readiness.omitted.length === 1
                  ? 'This feature is not on the paper'
                  : `These ${String(readiness.omitted.length)} features are not on the paper`}
              </b>{' '}
              — each failed to build, so the template does not have it.
            </p>
            <ul>
              {readiness.omitted.map((feature) => (
                <li key={feature.featureId}>
                  <b>{feature.featureName}</b>{' '}
                  <span className="dialog-note">in {feature.partName}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {counts.length > 0 && (
          <p data-testid="export-counts">
            The design has {counts.join(', ')}. The problems panel lists them; everything that built
            is on the paper.
          </p>
        )}

        <div className="dialog-actions">
          <button ref={closeRef} type="button" className="tool" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const plural = (count: number, word: string): string => (count === 1 ? word : `${word}s`);
