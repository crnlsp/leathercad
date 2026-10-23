import { mkdir, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic } from './atomicWrite.js';
import { projectFileName } from './renameFile.js';

/** A template the picker lists (8.12): one that ships with the app, or one the maker saved. */
export interface TemplateEntry {
  /** `builtin:<id>` or `mine:<name>`: what `read` is given back. */
  readonly id: string;
  readonly kind: 'builtin' | 'mine';
  /** The maker's name for one of theirs; a built-in one's is the catalogue's. */
  readonly name: string;
}

/** What saving a template came to. */
export type TemplateSave =
  | { readonly kind: 'saved'; readonly name: string }
  /** One of that name exists: nothing was written. Asked again with `replace`. */
  | { readonly kind: 'exists'; readonly name: string }
  | { readonly kind: 'invalid' };

/**
 * The project templates (8.12): those that ship with the app, at fixed paths
 * the renderer never sees, and the maker's own, saved from a project into a
 * folder of the app's — one ordinary `.lcp` per template, named as the maker
 * named it. Only a template's id crosses to the renderer, never a path: a
 * name is checked as a file name before it names anything here. No Electron
 * here; tested on real files.
 */
export class Templates {
  constructor(
    /** Each built-in template's id, and where its file is. */
    private readonly builtIn: Readonly<Record<string, string>>,
    /** The maker's templates' folder. */
    private readonly directory: string,
  ) {}

  /** Every template: the built-in ones in their order, then the maker's, by name. */
  async list(): Promise<TemplateEntry[]> {
    const mine: TemplateEntry[] = [];
    try {
      for (const file of (await readdir(this.directory)).sort((a, b) => a.localeCompare(b))) {
        if (!file.toLowerCase().endsWith('.lcp')) continue;
        const name = file.slice(0, -'.lcp'.length);
        if (projectFileName(name) !== file) continue;
        const info = await stat(join(this.directory, file)).catch(() => null);
        if (info?.isFile() === true) mine.push({ id: `mine:${name}`, kind: 'mine', name });
      }
    } catch {
      // No folder yet: no templates of the maker's.
    }
    return [
      ...Object.keys(this.builtIn).map((id) => ({
        id: `builtin:${id}`,
        kind: 'builtin' as const,
        name: id,
      })),
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

  /** Removes one of the maker's templates; a built-in one cannot be. */
  async remove(id: string): Promise<void> {
    if (!id.startsWith('mine:')) return;
    const path = this.pathOf(id);
    if (path !== null) await unlink(path).catch(() => undefined);
  }

  private pathOf(id: string): string | null {
    if (id.startsWith('builtin:')) return this.builtIn[id.slice('builtin:'.length)] ?? null;
    if (!id.startsWith('mine:')) return null;
    const file = projectFileName(id.slice('mine:'.length));
    return file === null ? null : join(this.directory, file);
  }
}
