import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RecoveryDialog } from './RecoveryDialog.js';
import { UnsavedChangesDialog } from './UnsavedChangesDialog.js';
import { UnsavedProjectsDialog } from './UnsavedProjectsDialog.js';

const nothing = (): void => undefined;

/** The class of the button with this test id, as rendered. */
function classOf(markup: string, testId: string): string {
  const button = new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`).exec(markup)?.[0] ?? '';
  return /class="([^"]*)"/.exec(button)?.[1] ?? '';
}

/**
 * One tone per meaning (U.24h): in every question about work that could be
 * lost, the answer that loses nothing — where focus starts — is the primary
 * one, and the answer that throws work away is the danger one.
 */
describe('the answer that loses nothing is primary', () => {
  it('in the question about one project’s unsaved work', () => {
    const markup = renderToStaticMarkup(
      createElement(UnsavedChangesDialog, {
        projectName: 'Wallet',
        action: 'close',
        onSave: nothing,
        onDiscard: nothing,
        onCancel: nothing,
      }),
    );
    expect(classOf(markup, 'unsaved-save')).toBe('tool primary');
    expect(classOf(markup, 'unsaved-discard')).toBe('tool danger');
  });

  it('in the question about several projects’', () => {
    const markup = renderToStaticMarkup(
      createElement(UnsavedProjectsDialog, {
        names: ['Wallet', 'Belt'],
        onSaveAll: nothing,
        onDiscard: nothing,
        onCancel: nothing,
      }),
    );
    expect(classOf(markup, 'unsaved-projects-save')).toBe('tool primary');
    expect(classOf(markup, 'unsaved-projects-discard')).toBe('tool danger');
  });

  it('in the offer of work a crash interrupted', () => {
    const markup = renderToStaticMarkup(
      createElement(RecoveryDialog, {
        projectName: 'Wallet',
        savedAt: '2026-11-19T10:00:00Z',
        onRecover: nothing,
        onDecline: nothing,
      }),
    );
    expect(classOf(markup, 'recovery-recover')).toBe('tool primary');
  });
});
