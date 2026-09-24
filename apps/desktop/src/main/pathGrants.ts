import { extname, isAbsolute, resolve } from 'node:path';

/** What the renderer asks to do with a path. */
export type PathUse = 'read' | 'write' | 'view';

/**
 * The files the external viewer may be asked to open. `shell.openPath` runs
 * whatever the operating system registered for a file, so a path that could
 * name a program — `.sh`, `.exe`, `.desktop` — must never reach it. The app
 * only ever opens the PDF it has just exported.
 */
const VIEWABLE = new Set(['.pdf']);

/**
 * The paths the renderer may read, write, or hand to the viewer: those the
 * user chose in the app's own open and save dialogs during this session.
 *
 * The renderer is sandboxed, but it passes paths to the main process, which
 * is not. Without this, anything that ran in the renderer could read or
 * overwrite any file the user can. A dialog is the user saying which file;
 * the grant lasts until the app quits and is never written anywhere.
 */
export class PathGrants {
  private readonly granted = new Set<string>();

  /**
   * Records a path a dialog returned. `extensions` are the dialog's filter
   * extensions: Save and Export append one when the name typed has none, so
   * that name is granted too.
   */
  grant(path: string, extensions: readonly string[] = []): void {
    if (!isAbsolute(path)) return;
    const chosen = resolve(path);
    this.granted.add(chosen);
    for (const extension of extensions) {
      // The filters come from the renderer too: an extension is letters and
      // digits, never a separator or a `..` that would name another file.
      const bare = extension.replace(/^\./, '');
      if (/^[a-z0-9]+$/i.test(bare)) this.granted.add(`${chosen}.${bare}`);
    }
  }

  /** Whether the renderer may use `path` this way. Anything but a string is refused. */
  allows(path: unknown, use: PathUse): boolean {
    if (typeof path !== 'string' || !isAbsolute(path)) return false;
    const target = resolve(path);
    if (!this.granted.has(target)) return false;
    return use !== 'view' || VIEWABLE.has(extname(target).toLowerCase());
  }

  /** As `allows`, but throws the error the renderer shows. */
  check(path: unknown, use: PathUse): string {
    if (!this.allows(path, use)) {
      throw new Error(
        `LeatherCAD only ${use === 'view' ? 'opens a PDF' : 'reads and writes files'} chosen in its own dialogs.`,
      );
    }
    return path as string;
  }
}
