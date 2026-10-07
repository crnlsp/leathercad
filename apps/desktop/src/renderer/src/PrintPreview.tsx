import { setPageSetup, type DocumentStore } from '@leathercad/document';
import { PAPER_SIZES, type Orientation, type PaperName, type Project } from '@leathercad/domain';
import { exportPdf } from '@leathercad/export';
import type { PrinterList } from '@leathercad/platform';
import { Check } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { offersPaper } from '../../shared/paper.js';

import { ExportFindings } from './ExportNotice.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { drawPage, openPdf } from './pdfPages.js';
import { getPlatformHost } from './platformBridge.js';
import { SeverityGlyph } from './SeverityGlyph.js';
import { describeSheets } from './sheetWords.js';
import { sheetPlanFor } from './sheets.js';
import { exportReportFor } from './useProjectFile.js';

const PAPERS = Object.keys(PAPER_SIZES) as PaperName[];
const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape'];
const MAX_COPIES = 99;
/** How wide the sheets are drawn, in CSS pixels: the list, and the one looked at. */
const THUMB_PX = 96;
const PAGE_PX = 520;

type Sending =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'sent'; readonly printer: string; readonly job: string }
  | { readonly kind: 'failed'; readonly printer: string; readonly reason: string };

/**
 * Print (7.6): LeatherCAD's own preview, then the printer — never a viewer's
 * print dialog, whose "fit to printable area" shrank a 100 mm line to 96 mm.
 *
 * **One PDF.** It is written once from the sheet plan the Sheets view draws,
 * pdf.js draws *those bytes* here, and the same bytes go to the printer, or to
 * the file *Save PDF…* writes. Nothing here lays out a sheet, and nothing
 * scales one: the only choices are the ones that cannot change the size of
 * what prints — printer, paper, which way up, which sheets, how many copies.
 * Paper and orientation are the project's (`setPageSetup`, one undo step), so
 * changing them here is changing them everywhere, and the PDF is written again.
 *
 * Where the app cannot print itself (Windows, the Flatpak, no CUPS) the same
 * preview saves the PDF instead, and says how it must be printed.
 */
export function PrintPreview({
  project,
  store,
  appVersion,
  onSavePdf,
  onClose,
}: {
  project: Project;
  store: DocumentStore;
  appVersion: string;
  /** Where printing is not possible here: save these bytes, and close. */
  onSavePdf: (bytes: Uint8Array) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ids = useId();
  const plan = sheetPlanFor(project);
  const { paper, orientation } = project.settings;
  const report = useMemo(() => exportReportFor(project), [project]);

  // The PDF: written once per plan, previewed, then printed or saved. One
  // written for another plan — the paper just changed — is not shown.
  const [written, setWritten] = useState<{
    plan: typeof plan;
    bytes: Uint8Array;
    doc: PDFDocumentProxy;
  } | null>(null);
  const pdf = written?.plan === plan ? written : null;
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let opened: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        // The print form: every page upright, as printers take paper, and a
        // landscape sheet turned a quarter on it — the one way CUPS prints it
        // whole, at 1:1 (7.6b, docs/printing.md §13).
        const { bytes } = await exportPdf(plan, {
          applicationVersion: appVersion,
          now: () => new Date(),
          upright: true,
        });
        opened = await openPdf(bytes);
        if (live) setWritten({ plan, bytes, doc: opened });
        else void opened.loadingTask.destroy();
      } catch (error) {
        if (live) setFailure(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      live = false;
      void opened?.loadingTask.destroy();
    };
  }, [plan, appVersion]);

  const [printers, setPrinters] = useState<PrinterList | null>(null);
  const [printerName, setPrinterName] = useState('');
  useEffect(() => {
    getPlatformHost()
      .listPrinters()
      .then(
        (list) => {
          setPrinters(list);
          if (list.available) setPrinterName(list.defaultPrinter ?? list.printers[0]?.name ?? '');
        },
        () => setPrinters({ available: false, reason: 'no-cups' }),
      );
  }, []);
  const direct = printers?.available === true && printers.printers.length > 0;
  const printer = direct ? printers.printers.find((p) => p.name === printerName) : undefined;

  const total = plan.sheets.length;
  const [looking, setCurrent] = useState(1);
  const current = Math.min(looking, total);
  // Sheets left out, for one plan: a new plan starts with every sheet in.
  const [leftOut, setOmitted] = useState<{ plan: typeof plan; pages: ReadonlySet<number> }>({
    plan,
    pages: new Set(),
  });
  const omitted = leftOut.plan === plan ? leftOut.pages : new Set<number>();
  const pages = Array.from({ length: total }, (_, i) => i + 1);
  const chosen = direct ? pages.filter((n) => !omitted.has(n)) : pages;

  const [copies, setCopies] = useState(1);
  const [sending, setSending] = useState<Sending>({ kind: 'idle' });
  // A printer not chosen yet is not refused: Print stays disabled without one.
  const paperOffered = offersPaper(printer?.papers ?? null, paper);
  // A landscape sheet lies turned a quarter counter-clockwise on its upright
  // page. Only the view turns it back, a quarter clockwise, so it reads as the
  // Sheets view shows it: what is drawn is still the bytes sent.
  const turn = pdf?.plan.setup.orientation === 'landscape' ? 90 : 0;

  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const print = async (bytes: Uint8Array, to: string): Promise<void> => {
    setSending({ kind: 'sending' });
    try {
      const job = await getPlatformHost().printPdf(bytes, {
        printer: to,
        paper,
        pages: chosen,
        copies,
        title: project.name.trim() || t('app.untitled'),
      });
      setSending({ kind: 'sent', printer: to, job });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // What CUPS said, without Electron's wrapping of a rejected IPC call.
      const reason = message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
      setSending({ kind: 'failed', printer: to, reason });
    }
  };

  const printLabel = t('printPreview.printSheets', { count: chosen.length });
  const canPrint =
    pdf !== null &&
    printer !== undefined &&
    chosen.length > 0 &&
    paperOffered &&
    sending.kind !== 'sending';

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog print-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}title`}
        data-testid="print-preview"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
      >
        <h3 id={`${ids}title`} className="print-header">
          {t('printPreview.title')}
        </h3>

        <div className="print-body">
          <ol className="print-sheets" aria-label={t('printPreview.sheets')}>
            {pages.map((n) => (
              <li key={n} className={n === current ? 'print-thumb current' : 'print-thumb'}>
                <button
                  type="button"
                  className="print-thumb-page"
                  aria-label={t('printPreview.show', { number: n })}
                  aria-pressed={n === current}
                  data-testid="print-thumb"
                  onClick={() => setCurrent(n)}
                >
                  {pdf !== null && (
                    <PageCanvas pdf={pdf.doc} number={n} widthPx={THUMB_PX} turn={turn} />
                  )}
                </button>
                <label className="print-thumb-label">
                  {direct && (
                    <input
                      type="checkbox"
                      data-testid="print-include"
                      aria-label={t('printPreview.include', { number: n })}
                      checked={!omitted.has(n)}
                      onChange={(event) => {
                        const next = new Set(omitted);
                        if (event.target.checked) next.delete(n);
                        else next.add(n);
                        setOmitted({ plan, pages: next });
                      }}
                    />
                  )}
                  {t('sheetNumbers.one', { number: n })}
                </label>
              </li>
            ))}
          </ol>

          <div className="print-page" data-testid="print-page">
            {pdf !== null ? (
              <PageCanvas pdf={pdf.doc} number={current} widthPx={PAGE_PX} turn={turn} />
            ) : (
              <p className="dialog-note">{failure ?? t('printPreview.loading')}</p>
            )}
          </div>

          <div className="print-options">
            <div className="field">
              <label className="field-label" htmlFor={`${ids}printer`}>
                {t('printPreview.printer')}
              </label>
              {direct ? (
                <select
                  id={`${ids}printer`}
                  data-testid="print-printer"
                  value={printerName}
                  onChange={(event) => setPrinterName(event.target.value)}
                >
                  {printers.printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                printers !== null && (
                  <p id={`${ids}printer`} data-testid="print-unavailable">
                    {printers.available
                      ? t('printPreview.noPrinters')
                      : t(`printPreview.unavailable.${printers.reason}`)}
                  </p>
                )
              )}
            </div>

            <div className="field">
              <label className="field-label" htmlFor={`${ids}paper`}>
                {t('printPreview.paper')}
              </label>
              <select
                id={`${ids}paper`}
                data-testid="print-paper"
                value={paper}
                onChange={(event) =>
                  store.dispatch(setPageSetup(event.target.value as PaperName, orientation))
                }
              >
                {PAPERS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" role="radiogroup" aria-labelledby={`${ids}orientation`}>
              <span className="field-label" id={`${ids}orientation`}>
                {t('printPreview.orientation')}
              </span>
              {ORIENTATIONS.map((way) => (
                <label key={way} className="print-choice">
                  <input
                    type="radio"
                    name={`${ids}orientation`}
                    data-testid={`print-${way}`}
                    checked={orientation === way}
                    onChange={() => store.dispatch(setPageSetup(paper, way))}
                  />
                  {t(`printPreview.${way}`)}
                </label>
              ))}
            </div>

            {direct && (
              <div className="field">
                <label className="field-label" htmlFor={`${ids}copies`}>
                  {t('printPreview.copies')}
                </label>
                <input
                  id={`${ids}copies`}
                  type="number"
                  data-testid="print-copies"
                  min={1}
                  max={MAX_COPIES}
                  step={1}
                  value={copies}
                  onChange={(event) => {
                    const value = Math.round(Number(event.target.value));
                    setCopies(
                      Math.min(MAX_COPIES, Math.max(1, Number.isFinite(value) ? value : 1)),
                    );
                  }}
                />
              </div>
            )}

            <dl className="print-facts">
              <dt>{t('printPreview.sheets')}</dt>
              <dd data-testid="print-summary">{describeSheets(plan, t)}</dd>
              <dt>{t('printPreview.scale')}</dt>
              <dd data-testid="print-scale">{t('printPreview.scaleLocked')}</dd>
            </dl>

            {direct ? (
              <p className="print-status ok" data-testid="print-no-scaling">
                <Icon of={Check} size={14} />
                <span>
                  <b>{t('printPreview.noScaling')}</b> {t('printPreview.noScalingDetail')}
                </span>
              </p>
            ) : (
              printers !== null && (
                <p className="print-status warning" data-testid="print-actual-size">
                  <SeverityGlyph severity="warning" />
                  <span>{t('printPreview.actualSize')}</span>
                </p>
              )
            )}
            {direct && !paperOffered && (
              <p className="print-status warning" role="alert" data-testid="print-paper-missing">
                <SeverityGlyph severity="warning" />
                <span>{t('printPreview.paperMissing', { printer: printerName, paper })}</span>
              </p>
            )}
            <p className="dialog-note">{t('printPreview.measure')}</p>

            {report !== null && <ExportFindings report={report} />}
          </div>
        </div>

        <div className="dialog-actions print-actions">
          <p className="print-sent" role="status" data-testid="print-result">
            {sending.kind === 'sending' && t('printPreview.sending')}
            {sending.kind === 'sent' &&
              t('printPreview.sent', { printer: sending.printer, job: sending.job })}
            {sending.kind === 'failed' &&
              t('printPreview.failed', { printer: sending.printer, reason: sending.reason })}
          </p>
          <button ref={cancelRef} type="button" className="tool" onClick={onClose}>
            {sending.kind === 'sent' ? t('actions.close') : t('actions.cancel')}
          </button>
          {direct || printers === null ? (
            <button
              type="button"
              className="tool primary"
              data-testid="print-submit"
              disabled={!canPrint}
              onClick={() => {
                if (pdf !== null && printer !== undefined) void print(pdf.bytes, printer.name);
              }}
            >
              {copies > 1
                ? t('printPreview.printCopies', { print: printLabel, copies })
                : printLabel}
            </button>
          ) : (
            <button
              type="button"
              className="tool primary"
              data-testid="print-save-pdf"
              disabled={pdf === null}
              onClick={() => {
                if (pdf !== null) onSavePdf(pdf.bytes);
              }}
            >
              {t('printPreview.savePdf')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One page of the PDF, drawn by pdf.js, its view turned `turn` degrees
 * clockwise; redrawn when the page or the PDF changes.
 */
function PageCanvas({
  pdf,
  number,
  widthPx,
  turn,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  widthPx: number;
  turn: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const abort = new AbortController();
    drawPage(pdf, number, canvas, widthPx, abort.signal, turn).catch(() => undefined);
    return () => abort.abort();
  }, [pdf, number, widthPx, turn]);
  return <canvas ref={ref} className="print-canvas" data-page={number} />;
}
