import type { OpenDialogOptions, PlatformHost, RecoveredCopy, SaveDialogOptions } from './host.js';

/**
 * A PlatformHost backed by a Map. Used by every test that would otherwise need
 * a filesystem or a window.
 *
 * Dialog results are scripted rather than prompted: push paths onto
 * `nextOpenPaths` / `nextSavePaths` and the corresponding call shifts one off.
 * An empty queue means the user cancelled, which is the case tests most often
 * forget to cover.
 */
export class InMemoryPlatformHost implements PlatformHost {
  readonly files = new Map<string, Uint8Array>();

  readonly nextOpenPaths: string[] = [];
  readonly nextSavePaths: string[] = [];

  /** Every dialog request, in order, so tests can assert on filters. */
  readonly dialogCalls: Array<
    { kind: 'open'; options: OpenDialogOptions } | { kind: 'save'; options: SaveDialogOptions }
  > = [];

  /** Paths passed to openInExternalViewer, in order. */
  readonly openedExternally: string[] = [];

  constructor(
    private readonly configDir = '/fake/config/leathercad',
    private readonly appVersion = '0.0.0-test',
  ) {}

  readFile(path: string): Promise<Uint8Array> {
    const data = this.files.get(path);
    if (data === undefined) {
      return Promise.reject(new Error(`ENOENT: no such file: ${path}`));
    }
    // Hand back a copy: a caller mutating the result must not corrupt the store.
    return Promise.resolve(Uint8Array.from(data));
  }

  writeFile(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, Uint8Array.from(data));
    return Promise.resolve();
  }

  showOpenDialog(options: OpenDialogOptions): Promise<string | null> {
    this.dialogCalls.push({ kind: 'open', options });
    return Promise.resolve(this.nextOpenPaths.shift() ?? null);
  }

  showSaveDialog(options: SaveDialogOptions): Promise<string | null> {
    this.dialogCalls.push({ kind: 'save', options });
    return Promise.resolve(this.nextSavePaths.shift() ?? null);
  }

  openInExternalViewer(path: string): Promise<void> {
    this.openedExternally.push(path);
    return Promise.resolve();
  }

  getUserConfigDir(): Promise<string> {
    return Promise.resolve(this.configDir);
  }

  getAppVersion(): Promise<string> {
    return Promise.resolve(this.appVersion);
  }

  /** This session's recovery copy, if any. */
  recovery: Uint8Array | null = null;
  /** What `findRecovery` returns: a copy a crashed session left. */
  abandoned: RecoveredCopy | null = null;
  readonly resolved: Array<{ id: string; how: 'adopt' | 'corrupt' }> = [];

  writeRecovery(data: Uint8Array): Promise<void> {
    this.recovery = Uint8Array.from(data);
    return Promise.resolve();
  }

  clearRecovery(): Promise<void> {
    this.recovery = null;
    return Promise.resolve();
  }

  findRecovery(): Promise<RecoveredCopy | null> {
    return Promise.resolve(this.abandoned);
  }

  resolveRecovery(id: string, how: 'adopt' | 'corrupt'): Promise<void> {
    this.resolved.push({ id, how });
    if (this.abandoned?.id === id) this.abandoned = null;
    return Promise.resolve();
  }

  getRecoveryIntervalMs(): Promise<number> {
    return Promise.resolve(60_000);
  }
}
