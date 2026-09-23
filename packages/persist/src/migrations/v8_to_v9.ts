import { DEFAULT_SETTINGS } from '@leathercad/domain';

/**
 * Version 8 to version 9 — the project says which paper it prints on.
 *
 * Version 9 adds `settings.paper` and `settings.orientation` (slice 5.5). Until
 * now there was nowhere to store the choice, so `exportPdf` fell back to
 * `DEFAULT_PAGE_SETUP` and **every project ever saved printed A4 portrait**.
 *
 * So the migration fills in exactly that, and the reason is not "a sensible
 * default": it is that anything else would change what comes out of the
 * printer for a file someone may already have cut a pattern from. A migration
 * is allowed to describe what a document already meant; it is not allowed to
 * decide something new on the user's behalf.
 *
 * A value that is already there is left alone. Nothing writes one yet, but a
 * migration that clobbers what it finds destroys work the first time a chain is
 * replayed for some other reason.
 *
 * Raw JSON, before validation: an old document cannot satisfy the new schema by
 * definition, which is why migrations run first (file-format.md §4.2).
 */
export function v8ToV9(document: unknown): unknown {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) return document;

  const record = document as Record<string, unknown>;
  const settings = record['settings'];
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) return document;

  const existing = settings as Record<string, unknown>;

  return {
    ...record,
    settings: {
      ...existing,
      paper: existing['paper'] ?? DEFAULT_SETTINGS.paper,
      orientation: existing['orientation'] ?? DEFAULT_SETTINGS.orientation,
    },
  };
}
