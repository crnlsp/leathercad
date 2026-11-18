import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DocumentStore, emptyDocument, type Command } from '@leathercad/document';
import { diagnose, type Diagnostic, type Project } from '@leathercad/domain';
import { loadProject, saveProject } from '@leathercad/persist';

import { record } from './coverage.js';
import { expectDiagnostics, ownersOf, report, type Expected } from './expectDiagnostics.js';

/** A maker's action: a command, or one read from the project as it stands (resize the outline it has). */
export type Action = Command | ((project: Project) => Command);

/** A fixed clock and version, so a save is the same bytes on every run. */
const SAVE = { applicationVersion: '0.0.0', now: () => new Date('2026-11-17T00:00:00.000Z') };

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures/projects');

/**
 * A workbench: one project in the real document store, edited as a maker
 * edits it — every action is a dispatched command and one undo step — and
 * saved and opened through the real file format.
 *
 * An action that changes nothing is refused here, loudly — whether the
 * command handed back the same project or a new one that saves the same. A
 * scenario whose edit silently did nothing (a wrong id, a refused command, a
 * value set to what it was) would otherwise pass by checking the state it
 * started in.
 */
export class Bench {
  private static made = 0;
  readonly store: DocumentStore;
  /** Tells this bench's states from another's in the same scenario, for the matrix. */
  private readonly id = Bench.made++;

  constructor(project: Project = emptyDocument('scenario').project) {
    this.store = new DocumentStore({ project });
  }

  /** A shipped project file, opened as the app opens it. */
  static open(name: string): Bench {
    return new Bench(loadProject(readFileSync(resolve(FIXTURES, `${name}.lcp`))).project);
  }

  get project(): Project {
    return this.store.getState().document.project;
  }

  /** The whole list, and a state the matrix may count (`coverage.ts`). */
  get diagnostics(): readonly Diagnostic[] {
    const found = diagnose(this.project);
    record(this.id, this.project, found);
    return found;
  }

  /** Each action is one dispatch, as each of a maker's edits is one undo step. */
  do(...actions: readonly Action[]): this {
    for (const action of actions) {
      const before = this.project;
      const command = typeof action === 'function' ? action(before) : action;
      this.store.dispatch(command);
      if (this.project === before || JSON.stringify(this.project) === JSON.stringify(before)) {
        throw new Error(
          `"${command.label.action}" changed nothing: a scenario step must do what it says`,
        );
      }
    }
    return this;
  }

  undo(steps = 1): this {
    for (let i = 0; i < steps; i++) {
      if (!this.store.getState().canUndo) throw new Error('nothing left to undo');
      this.store.undo();
    }
    return this;
  }

  redo(steps = 1): this {
    for (let i = 0; i < steps; i++) {
      if (!this.store.getState().canRedo) throw new Error('nothing left to redo');
      this.store.redo();
    }
    return this;
  }

  /** Saved through the file format and opened again: a fresh store, as opening a file gives. */
  saveAndReopen(): Bench {
    return new Bench(loadProject(saveProject(this.project, SAVE)).project);
  }

  /** The whole diagnostic list is exactly `expected` (see `expectDiagnostics`). */
  expect(expected: readonly Expected[], when?: string): this {
    record(this.id, this.project, diagnose(this.project));
    expectDiagnostics(this.project, expected, when);
    return this;
  }

  /**
   * A known defect, pinned: the list is exactly what the defect makes it
   * today (`now`), and that is not what is right (`correct`). Unlike
   * `it.fails`, nothing else can make this pass: a broken setup, a renamed id
   * or a different wrong answer fails it, and so does the fix — which then
   * replaces this call with `expect(correct)`, and takes the defect out of
   * `KNOWN_DEFECTS`.
   */
  expectDefect(
    defect: string,
    { now, correct }: { now: readonly Expected[]; correct: readonly Expected[] },
  ): this {
    const found = diagnose(this.project);
    const changed = report(found, now, undefined, ownersOf(this.project));
    if (changed !== null) {
      throw new Error(
        `Known defect ${defect} no longer shows as recorded. If it is fixed, assert the correct list ` +
          `instead and remove it from KNOWN_DEFECTS.\n${changed}`,
      );
    }
    if (report(found, correct) === null) {
      throw new Error(`Known defect ${defect}: "now" and "correct" are the same list`);
    }
    return this;
  }
}
