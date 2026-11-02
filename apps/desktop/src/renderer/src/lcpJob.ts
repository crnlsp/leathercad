import type { Project } from '@leathercad/domain';
import { saveProject } from '@leathercad/persist';

/**
 * A project to be made into the bytes of a `.lcp`: everything `saveProject`
 * reads, as data a worker can be sent (PERF-009). The time is the moment the
 * save was asked for, so the manifest says when the maker saved, not when the
 * worker got to it; and nothing here reads a clock.
 */
export interface LcpJob {
  readonly project: Project;
  readonly applicationVersion: string;
  /** When the save was asked for, as `toISOString()` writes it. */
  readonly at: string;
  readonly createdUtc?: string;
}

/** What the worker answers: the file, or why it is not one. */
export type LcpReply =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly message: string };

/**
 * The file a job asks for: exactly the bytes `saveProject` writes for it. A
 * worker runs this on its copy of the project, which the structured clone
 * makes value for value, so the file is the one the window's thread would have
 * written; and the window runs it itself when no worker can.
 */
export function runLcpJob(job: LcpJob): Uint8Array {
  return saveProject(job.project, {
    applicationVersion: job.applicationVersion,
    now: () => new Date(job.at),
    ...(job.createdUtc === undefined ? {} : { createdUtc: job.createdUtc }),
  });
}
