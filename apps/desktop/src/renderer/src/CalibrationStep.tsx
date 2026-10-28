import { correctionFrom, isNoCorrection, type ScaleCorrection } from '@leathercad/core';
import { PAPER_SIZES, type PaperName } from '@leathercad/domain';
import { calibrationLengths, exportCalibrationPdf } from '@leathercad/export';
import { useEffect, useId, useRef, useState } from 'react';

import { describeFactor } from './calibration.js';
import { useI18n } from './i18n.js';
import { NumberField } from './NumberField.js';
import { getPlatformHost, refusalOf } from './platformBridge.js';
import { SeverityGlyph } from './SeverityGlyph.js';

type Sending =
  | { readonly kind: 'idle' | 'sending' }
  | { readonly kind: 'sent'; readonly job: string }
  | { readonly kind: 'failed'; readonly reason: string };

/**
 * Calibrating a printer (7.5, docs/printing.md §8.2), as a step of the Print
 * Preview: print the calibration page on this printer, measure its two lines,
 * and store the correction that makes them as long as they were drawn — for
 * this printer alone, in the app's configuration, never in the project.
 *
 * The page goes out uncorrected, so what is measured is the printer's own
 * error, whatever was stored before. A measurement more than 2 % off is
 * refused: that is a print setting, and a correction would hide it.
 */
export function CalibrationStep({
  printer,
  paper,
  canPrint,
  appVersion,
  onSaved,
  onCancel,
}: {
  printer: string;
  paper: PaperName;
  /** The printer offers the paper: the page can be sent. */
  canPrint: boolean;
  appVersion: string;
  onSaved: (correction: ScaleCorrection) => void;
  onCancel: () => void;
}) {
  const { t, locale } = useI18n();
  const ids = useId();
  const drawnMm = calibrationLengths(PAPER_SIZES[paper]);
  const [measured, setMeasured] = useState<{ x: number; y: number }>(drawnMm);
  const [sending, setSending] = useState<Sending>({ kind: 'idle' });
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const result = correctionFrom(drawnMm, measured);

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const printPage = async (): Promise<void> => {
    setSending({ kind: 'sending' });
    try {
      const { bytes } = await exportCalibrationPdf(PAPER_SIZES[paper], {
        applicationVersion: appVersion,
        now: () => new Date(),
      });
      const job = await getPlatformHost().printPdf(bytes, {
        printer,
        paper,
        pages: [1],
        copies: 1,
        title: t('calibration.jobTitle'),
      });
      setSending({ kind: 'sent', job });
    } catch (error) {
      setSending({ kind: 'failed', reason: refusalOf(error) });
    }
  };

  const save = async (correction: ScaleCorrection): Promise<void> => {
    try {
      // Measured as drawn: nothing to correct, so nothing is kept.
      await getPlatformHost().setPrinterCorrection(
        printer,
        isNoCorrection(correction) ? null : correction,
      );
      onSaved(correction);
    } catch (error) {
      setSaveFailed(refusalOf(error));
    }
  };

  return (
    <section
      className="print-calibration"
      aria-labelledby={`${ids}title`}
      data-testid="calibration"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onCancel();
      }}
    >
      <h4 id={`${ids}title`} ref={headingRef} tabIndex={-1}>
        {t('calibration.title', { printer })}
      </h4>
      <p className="dialog-note">{t('calibration.lead')}</p>

      <p>{t('calibration.printStep', { paper, x: drawnMm.x, y: drawnMm.y })}</p>
      <button
        type="button"
        className="tool"
        data-testid="calibration-print"
        disabled={!canPrint || sending.kind === 'sending'}
        onClick={() => void printPage()}
      >
        {t('calibration.printPage')}
      </button>
      <p role="status" data-testid="calibration-sent">
        {sending.kind === 'sending' && t('printPreview.sending')}
        {sending.kind === 'sent' && t('printPreview.sent', { printer, job: sending.job })}
        {sending.kind === 'failed' && t('printPreview.failed', { printer, reason: sending.reason })}
      </p>

      <p>{t('calibration.measureStep')}</p>
      <NumberField
        label={t('calibration.horizontal', { length: drawnMm.x })}
        value={measured.x}
        min={0}
        onCommit={(x) => setMeasured((m) => ({ ...m, x }))}
      />
      <NumberField
        label={t('calibration.vertical', { length: drawnMm.y })}
        value={measured.y}
        min={0}
        onCommit={(y) => setMeasured((m) => ({ ...m, y }))}
      />

      {result.ok ? (
        <p data-testid="calibration-result">
          {t('calibration.result', {
            x: describeFactor(result.value.x, locale),
            y: describeFactor(result.value.y, locale),
          })}
        </p>
      ) : (
        <p className="print-status warning" role="alert" data-testid="calibration-too-far">
          <SeverityGlyph severity="warning" />
          <span>{t('calibration.tooFar')}</span>
        </p>
      )}
      {saveFailed !== null && (
        <p className="print-status warning" role="alert">
          <SeverityGlyph severity="warning" />
          <span>{t('calibration.saveFailed', { reason: saveFailed })}</span>
        </p>
      )}

      <div className="print-calibration-actions">
        <button type="button" className="tool" onClick={onCancel}>
          {t('actions.cancel')}
        </button>
        <button
          type="button"
          className="tool primary"
          data-testid="calibration-save"
          disabled={!result.ok}
          onClick={() => {
            if (result.ok) void save(result.value);
          }}
        >
          {t('calibration.save')}
        </button>
      </div>
    </section>
  );
}
