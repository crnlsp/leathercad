/**
 * @leathercad/persist — the `.lcp` project format.
 *
 * Stores parameters, never derived geometry. See docs/file-format.md.
 */

export type { Manifest, StoredProject } from './schema.js';
export { ManifestSchema, ProjectSchema } from './schema.js';

export type { Migration } from './migrations/index.js';
export {
  CURRENT_FORMAT_VERSION,
  MIGRATIONS,
  NewerFormatError,
  migrate,
} from './migrations/index.js';

export type { LoadedProject, SaveOptions } from './lcp.js';
export {
  InvalidProjectFileError,
  LCP_EXTENSION,
  LCP_MIME,
  loadProject,
  readManifest,
  saveProject,
  stableJson,
} from './lcp.js';
