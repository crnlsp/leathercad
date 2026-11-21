import { ResourceLimitError } from '@leathercad/core';
import {
  CURRENT_FORMAT_VERSION,
  InvalidProjectFileError,
  NewerFormatError,
  UnsavableProjectError,
} from '@leathercad/persist';

import type { Translate } from '../../shared/i18n.js';
import { REFUSAL } from '../../shared/refusals.js';
import { PdfWriterError } from './pdfWriter.js';
import { refusalOf } from './platformBridge.js';
import { describeProblemWithSubject } from './problemText.js';

/**
 * A file error in the interface's words (ADR 0018): every refusal below
 * `apps/desktop` arrives as a fact — a persist refusal, a resource limit, an
 * operating system's error code, a main-process refusal — and is worded here.
 * Only an error nothing expected is said with its own detail, inside words of
 * the app's.
 */
export function fileErrorText(error: unknown, t: Translate): string {
  if (error instanceof ResourceLimitError) {
    return t('file.resourceLimit', {
      resource: t(`file.resources.${error.resource}`),
      limit: error.limit,
    });
  }
  if (error instanceof NewerFormatError) {
    return t(error.savedBy === undefined ? 'file.newer' : 'file.newerNamed', {
      version: error.savedBy ?? '',
      format: error.fileVersion,
      current: CURRENT_FORMAT_VERSION,
    });
  }
  if (error instanceof InvalidProjectFileError) return refusalText(error, t);
  if (error instanceof UnsavableProjectError) {
    // A save, not a damaged file (QA2): where the schema broke, when it says.
    const { refusal } = error.reason;
    const where = refusal.kind === 'schema' ? refusal.where[0] : undefined;
    return where === undefined ? t('file.unsavable') : t('file.unsavableAt', { where });
  }
  if (error instanceof PdfWriterError) {
    return t(error.kind === 'failed' ? 'file.pdfFailed' : 'file.pdfUnavailable', {
      reason: error.detail,
    });
  }
  const said = refusalOf(error);
  return systemText(said, t) ?? t('file.unexpected', { reason: said });
}

function refusalText(error: InvalidProjectFileError, t: Translate): string {
  const refusal = error.refusal;
  switch (refusal.kind) {
    case 'not-an-archive':
      return t('file.notArchive');
    case 'not-a-project':
      return t('file.notProject');
    case 'entry-missing':
      return t('file.entryMissing', { entry: refusal.entry });
    case 'not-json':
      return t('file.notJson', { entry: refusal.entry });
    case 'schema': {
      const [where] = refusal.where;
      return where === undefined
        ? t('file.schema', { entry: refusal.entry })
        : t('file.schemaAt', { entry: refusal.entry, where });
    }
    case 'design':
      return t('file.invalid', {
        problems: error.problems.map((p) => describeProblemWithSubject(p, t)).join(' '),
      });
    case 'not-the-copy':
      return t('pieces.pasteFailed');
    default:
      return refusal satisfies never;
  }
}

/**
 * An operating system's refusal, or the main process's, by its code. Node
 * starts an error's message with its code (`ENOENT: no such file…`), and that
 * message is all that crosses IPC; the main process's own refusals are codes
 * (`REFUSAL`).
 */
function systemText(said: string, t: Translate): string | null {
  switch (/^[A-Z_]+/.exec(said)?.[0]) {
    case 'ENOENT':
      return t('file.system.notFound');
    case 'EACCES':
    case 'EPERM':
      return t('file.system.denied');
    case 'ENOSPC':
      return t('file.system.full');
    case 'EROFS':
      return t('file.system.readOnly');
    case REFUSAL.notGranted:
      return t('file.system.notGranted');
    case REFUSAL.notViewable:
      return t('file.system.notViewable');
    case REFUSAL.notAProject:
      return t('file.system.notAProject');
    case REFUSAL.noSuchTemplate:
      return t('file.system.noSuchTemplate');
    default:
      return null;
  }
}
