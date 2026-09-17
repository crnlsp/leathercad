/**
 * The migration chain.
 *
 * Three rules, and they are not negotiable (docs/file-format.md §4.2):
 *
 * 1. A shipped migration is **immutable**. If one was wrong, write another
 *    after it. Editing one changes the meaning of files already on disk.
 * 2. Never delete a migration. The chain must reach back to version 1 forever.
 * 3. Every version bump commits a fixture under `fixtures/format/`, and a test
 *    that opens it. That corpus is the only thing proving the chain still
 *    works.
 *
 * Migrations run on **raw JSON, before validation** — validating first would
 * reject old files by definition.
 */
import { v1ToV2 } from './v1_to_v2.js';
import { v2ToV3 } from './v2_to_v3.js';
import { v3ToV4 } from './v3_to_v4.js';
import { v4ToV5 } from './v4_to_v5.js';
import { v5ToV6 } from './v5_to_v6.js';
import { v6ToV7 } from './v6_to_v7.js';

export interface Migration {
  readonly from: number;
  readonly to: number;
  migrate(document: unknown): unknown;
}

export const MIGRATIONS: readonly Migration[] = [
  // Version 1 is the first shipped format; nothing precedes it.
  { from: 1, to: 2, migrate: v1ToV2 },
  { from: 2, to: 3, migrate: v2ToV3 },
  { from: 3, to: 4, migrate: v3ToV4 },
  { from: 4, to: 5, migrate: v4ToV5 },
  { from: 5, to: 6, migrate: v5ToV6 },
  // The first that rewrites data rather than passing it through.
  { from: 6, to: 7, migrate: v6ToV7 },
];

export const CURRENT_FORMAT_VERSION = 7;

export class NewerFormatError extends Error {
  constructor(readonly fileVersion: number) {
    super(
      `This file was saved by a newer version of LeatherCAD (format ${fileVersion}; ` +
        `this build understands up to ${CURRENT_FORMAT_VERSION}).`,
    );
    this.name = 'NewerFormatError';
  }
}

/**
 * Walks a document forward to the current version.
 *
 * A file from the future is **refused, not guessed at**. Silently dropping
 * fields we do not recognise would hand the user back a quietly damaged
 * project.
 */
export function migrate(document: unknown, fileVersion: number): unknown {
  if (fileVersion > CURRENT_FORMAT_VERSION) throw new NewerFormatError(fileVersion);

  let current = document;
  for (const migration of MIGRATIONS) {
    if (migration.from >= fileVersion) current = migration.migrate(current);
  }
  return current;
}
