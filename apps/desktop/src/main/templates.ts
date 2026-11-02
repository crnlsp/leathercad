import { mkdir, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { writeFileAtomic } from './atomicWrite.js';
import { projectFileName, renameProjectFile } from './renameFile.js';

/** A template the picker lists (8.14): one that ships with the app, or one the maker saved. */
export interface TemplateEntry {
  /** `builtin:<id>` or `mine:<name>`: what `read` is given back. */
  readonly id: string;
  readonly kind: 'builtin' | 'mine';
  /** The maker's name for one of theirs; a built-in one's id, which the app words. */
  readonly name: string;
  /** When the maker's was saved, and last changed, in ms; null for a built-in one. */
  readonly created: number | null;
  readonly changed: number | null;
  /** The maker's own words about it; empty for a built-in one, which the app words. */
  readonly description: string;
  /** The maker's own tags, for the picker's filter. */
  readonly tags: readonly string[];
  /** Pinned to the top of the picker. */
  readonly pinned: boolean;
  /** When a project was last made from it, in ms, or null. */
  readonly usedAt: number | null;
}

/** What saving, renaming, duplicating or importing a template came to. */
export type TemplateSave =
  | { readonly kind: 'saved'; readonly name: string }
  /** One of that name exists: nothing was written. Asked again with `replace`. */
  | { readonly kind: 'exists'; readonly name: string }
  | { readonly kind: 'invalid' };

/** What the app keeps about each template beside its file. */
interface TemplateInfo {
  description?: string;
  tags?: string[];
  pinned?: boolean;
  usedAt?: number;
}

/** The metadata's file, in the maker's templates' folder; never listed as a template. */
const INDEX = 'templates.json';
const MAX_DESCRIPTION = 500;
const MAX_TAGS = 12;
const MAX_TAG = 40;

/**
 * The project templates (8.12, 8.14): those that ship with the app, at fixed
 * paths the renderer never sees, and the maker's own, saved from a project
 * into a folder of the app's — one ordinary `.lcp` per template, named as the
 * maker named it — with what the app keeps about each (its description, tags,
 * whether it is pinned, when it was last used) in one file beside them.
 *
 * Only a template's id crosses to the renderer, never a path, but for
 * *Edit template*, which opens the maker's own as a project: a name is
 * checked as a file name before it names anything here. No Electron here;
 * tested on real files, with the clock given.
 */
export class Templates {
  constructor(
    /** Each built-in template's id, and where its file is. */
    private readonly builtIn: Readonly<Record<string, string>>,
    /** The maker's templates' folder. */
    private readonly directory: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Every template: the built-in ones in their order, then the maker's, by name. */
  async list(): Promise<TemplateEntry[]> {
    const index = await this.readIndex();
    const entry = (
      id: string,
      kind: TemplateEntry['kind'],
      name: string,
      times?: { created: number; changed: number },
    ): TemplateEntry => {
      const info = index[id] ?? {};
      return {
        id,
        kind,
        name,
        created: times?.created ?? null,
        changed: times?.changed ?? null,
        description: kind === 'mine' ? (info.description ?? '') : '',
        tags: kind === 'mine' ? (info.tags ?? []) : [],
        pinned: info.pinned === true,
        usedAt: info.usedAt ?? null,
      };
    };
    const mine: TemplateEntry[] = [];
    try {
      for (const file of (await readdir(this.directory)).sort((a, b) => a.localeCompare(b))) {
        if (!file.toLowerCase().endsWith('.lcp')) continue;
        const name = file.slice(0, -'.lcp'.length);
        if (projectFileName(name) !== file) continue;
        const info = await stat(join(this.directory, file)).catch(() => null);
        if (info?.isFile() !== true) continue;
        // Birth where the file system keeps it; its last change where it does not.
        const created = info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs;
        mine.push(entry(`mine:${name}`, 'mine', name, { created, changed: info.mtimeMs }));
      }
    } catch {
      // No folder yet: no templates of the maker's.
    }
    return [
      ...Object.keys(this.builtIn).map((id) => entry(`builtin:${id}`, 'builtin', id)),
      ...mine,
    ];
  }

  /** A template's bytes, by its id; null for an id that names none. */
  async read(id: string): Promise<Uint8Array | null> {
    const path = this.pathOf(id);
    if (path === null) return null;
    try {
      const data = await readFile(path);
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } catch {
      return null;
    }
  }

  /** Saves a project as one of the maker's templates, never over one unless asked. */
  async save(name: string, data: Uint8Array, replace: boolean): Promise<TemplateSave> {
    const file = projectFileName(name);
    if (file === null) return { kind: 'invalid' };
    const shown = file.slice(0, -'.lcp'.length);
    const path = join(this.directory, file);
    if (!replace && (await stat(path).catch(() => null)) !== null) {
      return { kind: 'exists', name: shown };
    }
    await mkdir(this.directory, { recursive: true });
    await writeFileAtomic(path, data);
    return { kind: 'saved', name: shown };
  }

  /** Renames one of the maker's, never over another; what is kept about it follows. */
  async rename(id: string, name: string): Promise<TemplateSave> {
    const from = this.mineOf(id);
    if (from === null) return { kind: 'invalid' };
    const outcome = await renameProjectFile(from, name);
    if (outcome.kind === 'invalid') return { kind: 'invalid' };
    if (outcome.kind === 'exists')
      return { kind: 'exists', name: outcome.file.slice(0, -'.lcp'.length) };
    const renamed = basename(outcome.path).slice(0, -'.lcp'.length);
    await this.moveInfo(id, `mine:${renamed}`, false);
    return { kind: 'saved', name: renamed };
  }

  /**
   * A copy of any template as one of the maker's, under the first free name
   * of `name`, `name 2`, `name 3`…: what *Duplicate* and *Import* make. The
   * maker's words about it come along.
   */
  async duplicate(id: string, name: string): Promise<TemplateSave> {
    const data = await this.read(id);
    if (data === null) return { kind: 'invalid' };
    const saved = await this.saveFree(name, data);
    if (saved.kind === 'saved') await this.moveInfo(id, `mine:${saved.name}`, true);
    return saved;
  }

  /** A `.lcp` from anywhere, chosen in a dialog, as one of the maker's, named for its file. */
  async importFrom(path: string): Promise<TemplateSave> {
    const data = await readFile(path);
    const name = basename(path).replace(/\.lcp$/i, '');
    return this.saveFree(name, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }

  /** A template written to a file chosen in a dialog, to share it. */
  async exportTo(id: string, path: string): Promise<void> {
    const from = this.pathOf(id);
    if (from === null) throw new Error('No such template.');
    // Over a file the maker chose, which may be one they already had: whole or untouched.
    await writeFileAtomic(path, await readFile(from));
  }

  /** The maker's template's own file, for *Edit template* and *Show in folder*; null otherwise. */
  fileOf(id: string): string | null {
    return this.mineOf(id);
  }

  /** Removes one of the maker's templates, and what is kept about it; a built-in one cannot be. */
  async remove(id: string): Promise<void> {
    const path = this.mineOf(id);
    if (path === null) return;
    await unlink(path).catch(() => undefined);
    const index = await this.readIndex();
    if (id in index) {
      delete index[id];
      await this.writeIndex(index);
    }
  }

  /** The maker's words about one of theirs: a description and tags, tidied. */
  async describe(id: string, description: string, tags: readonly string[]): Promise<void> {
    if (this.mineOf(id) === null) return;
    const cleanTags = [
      ...new Set(tags.map((tag) => tag.trim().slice(0, MAX_TAG)).filter((tag) => tag !== '')),
    ].slice(0, MAX_TAGS);
    await this.change(id, (info) => {
      info.description = description.trim().slice(0, MAX_DESCRIPTION);
      info.tags = cleanTags;
    });
  }

  /** Pins any template to the top of the picker, or lets it go. */
  async pin(id: string, pinned: boolean): Promise<void> {
    if (this.pathOf(id) === null) return;
    await this.change(id, (info) => {
      info.pinned = pinned;
    });
  }

  /** A project was made from it: it leads *Recently used*. */
  async used(id: string): Promise<void> {
    if (this.pathOf(id) === null) return;
    await this.change(id, (info) => {
      info.usedAt = this.now();
    });
  }

  private async saveFree(name: string, data: Uint8Array): Promise<TemplateSave> {
    if (projectFileName(name) === null) return { kind: 'invalid' };
    for (let n = 1; n < 100; n++) {
      const saved = await this.save(n === 1 ? name : `${name} ${String(n)}`, data, false);
      if (saved.kind !== 'exists') return saved;
    }
    return { kind: 'exists', name };
  }

  private async change(id: string, edit: (info: TemplateInfo) => void): Promise<void> {
    const index = await this.readIndex();
    const info = { ...index[id] };
    edit(info);
    index[id] = info;
    await this.writeIndex(index);
  }

  /** What is kept about a template, under its new id: moved by a rename, copied by a duplicate. */
  private async moveInfo(from: string, to: string, copy: boolean): Promise<void> {
    const index = await this.readIndex();
    const info = index[from];
    if (info === undefined) return;
    // A copy is new: not pinned, never used.
    index[to] = copy ? { description: info.description ?? '', tags: info.tags ?? [] } : info;
    if (!copy) delete index[from];
    await this.writeIndex(index);
  }

  private async readIndex(): Promise<Record<string, TemplateInfo>> {
    try {
      const raw: unknown = JSON.parse(await readFile(join(this.directory, INDEX), 'utf8'));
      if (typeof raw !== 'object' || raw === null) return {};
      const index: Record<string, TemplateInfo> = {};
      for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null) continue;
        const { description, tags, pinned, usedAt } = value as Record<string, unknown>;
        index[id] = {
          ...(typeof description === 'string'
            ? { description: description.slice(0, MAX_DESCRIPTION) }
            : {}),
          ...(Array.isArray(tags)
            ? {
                tags: tags
                  .filter((tag): tag is string => typeof tag === 'string')
                  .slice(0, MAX_TAGS),
              }
            : {}),
          ...(pinned === true ? { pinned: true } : {}),
          ...(typeof usedAt === 'number' && Number.isFinite(usedAt) ? { usedAt } : {}),
        };
      }
      return index;
    } catch {
      // None yet, or damaged: nothing is known beyond the files.
      return {};
    }
  }

  private async writeIndex(index: Record<string, TemplateInfo>): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFileAtomic(
      join(this.directory, INDEX),
      new TextEncoder().encode(`${JSON.stringify(index, null, 2)}\n`),
    );
  }

  private mineOf(id: string): string | null {
    if (!id.startsWith('mine:')) return null;
    const file = projectFileName(id.slice('mine:'.length));
    return file === null ? null : join(this.directory, file);
  }

  private pathOf(id: string): string | null {
    if (id.startsWith('builtin:')) return this.builtIn[id.slice('builtin:'.length)] ?? null;
    return this.mineOf(id);
  }
}
