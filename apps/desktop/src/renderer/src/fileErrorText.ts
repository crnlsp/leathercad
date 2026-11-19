import { ResourceLimitError } from '@leathercad/core';
import {
  CURRENT_FORMAT_VERSION,
  InvalidProjectFileError,
  NewerFormatError,
} from '@leathercad/persist';

import type { Translate } from '../../shared/i18n.js';
import { PdfWriterError } from './pdfWriter.js';
import { describeProblemWithSubject } from './problemText.js';

/**
 * A file error in the interface's words (ADR 0018). A file from a newer
 * version, and a design whose reference graph is broken, are said in full;
 * anything below that — bytes that are not an archive, a schema violation,
 * the operating system refusing a write — is said as it was reported.
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
  if (error instanceof InvalidProjectFileError && error.problems.length > 0) {
    const problems = error.problems.map((p) => describeProblemWithSubject(p, t)).join(' ');
    return t('file.invalid', { problems });
  }
  if (error instanceof PdfWriterError) {
    return t(error.kind === 'failed' ? 'file.pdfFailed' : 'file.pdfUnavailable', {
      reason: error.detail,
    });
  }
  return error instanceof Error ? error.message : String(error);
}
