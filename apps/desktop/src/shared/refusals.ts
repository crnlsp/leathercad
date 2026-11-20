/**
 * Refusals the main process makes on purpose, as codes the renderer words
 * (ADR 0018). Only an error's message crosses IPC — Electron drops its class
 * and its fields — so the message is the code.
 */
export const REFUSAL = {
  /** A path no dialog, recent entry or launch granted (`pathGrants.ts`). */
  notGranted: 'LEATHERCAD_PATH_NOT_GRANTED',
  /** A file for the system's viewer that is not a granted PDF. */
  notViewable: 'LEATHERCAD_NOT_VIEWABLE',
  /** The Trash asked to take something other than a project file. */
  notAProject: 'LEATHERCAD_NOT_A_PROJECT_FILE',
  /** A template that is not there any more. */
  noSuchTemplate: 'LEATHERCAD_NO_SUCH_TEMPLATE',
} as const;
