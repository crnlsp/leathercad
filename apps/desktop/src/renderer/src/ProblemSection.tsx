import {
  fixCommand,
  fixRefusal,
  proposeFix,
  type DocumentStore,
  type Fix,
} from '@leathercad/document';
import {
  diagnose,
  problemKey,
  type Diagnostic,
  type Problem,
  type Project,
} from '@leathercad/domain';
import { useEffect, useRef, useState } from 'react';

import { fixText } from './fixText.js';
import { useI18n } from './i18n.js';
import { ProblemRows } from './ProblemList.js';
import { ReasonedButton } from './ReasonedButton.js';

/**
 * Properties' list of what is wrong with the selection, each problem with the
 * one plainly safe fix it has, if any (9.17).
 *
 * Pointing at a fix previews it through the store's gesture — never history —
 * and choosing it is one step. While it is previewed the list is the committed
 * document's, so the row being fixed stays under the pointer instead of
 * vanishing with its problem.
 */
export function ProblemSection({
  store,
  diagnostics,
  project,
  of,
  testId,
  showWhere = true,
}: {
  store: DocumentStore;
  /** The one diagnostic list (X7), filtered here by `of`. */
  diagnostics: readonly Diagnostic[];
  project: Project;
  of: (diagnostic: Diagnostic) => boolean;
  testId: string;
  showWhere?: boolean;
}) {
  const { t } = useI18n();
  const [pointing, setPointing] = useState<Fix | null>(null);
  const [refused, setRefused] = useState<{ fix: Fix; reason: Problem } | null>(null);
  const previewing = pointing !== null && store.inTransaction;
  const committed = store.committedDocument.project;
  const rows = (previewing ? diagnose(committed) : diagnostics).filter(of);

  // A preview must not outlive the panel that started it. Kept in a ref by the
  // handlers, so moving from one fix straight to another cancels neither.
  const preview = useRef<Fix | null>(null);
  const section = useRef<HTMLElement>(null);
  useEffect(
    () => () => {
      if (preview.current !== null && store.inTransaction) store.rollback();
    },
    [store],
  );

  if (rows.length === 0) return null;

  // Another gesture under way — a drag — offers nothing: its fixes are not yet known.
  const fixOf = (diagnostic: Diagnostic): Fix | null => {
    if (store.inTransaction && !previewing) return null;
    const key = problemKey(diagnostic.problem);
    const listed = diagnose(committed).find((d) => problemKey(d.problem) === key);
    return listed === undefined ? null : proposeFix(committed, listed);
  };

  const point = (fix: Fix, on: boolean) => {
    if (on) {
      if (refused?.fix === fix) return;
      const command = fixCommand(fix);
      store.begin(command.label);
      store.preview(command);
      preview.current = fix;
      setPointing(fix);
    } else if (preview.current === fix) {
      preview.current = null;
      setPointing(null);
      if (store.inTransaction) store.rollback();
    }
  };

  const choose = (fix: Fix) => {
    const reason = fixRefusal(store.committedDocument.project, fix);
    preview.current = null;
    setPointing(null);
    if (reason !== null) {
      if (store.inTransaction) store.rollback();
      setRefused({ fix, reason });
      return;
    }
    // The row goes with its problem; focus stays in the panel, not on the page.
    const panel = section.current?.closest<HTMLElement>('[data-testid="property-panel"]') ?? null;
    store.dispatch(fixCommand(fix));
    panel?.focus();
  };

  return (
    <section className="panel-section" data-testid={testId} ref={section}>
      <div className="panel-heading">{t('properties.problems', { count: rows.length })}</div>
      <ProblemRows
        diagnostics={rows}
        project={previewing ? committed : project}
        showWhere={showWhere}
        action={(diagnostic) => {
          const fix = fixOf(diagnostic);
          if (fix === null) return null;
          return (
            <span className="problem-action">
              <ReasonedButton
                testId="problem-fix"
                reason={refused?.fix === fix ? refused.reason : null}
                hint={t('fixes.hint')}
                onPoint={(on) => point(fix, on)}
                onClick={() => choose(fix)}
              >
                {fixText(fix, t)}
              </ReasonedButton>
            </span>
          );
        }}
      />
    </section>
  );
}
