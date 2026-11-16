import { spawn } from 'node:child_process';
import { getPriority, setPriority } from 'node:os';

/**
 * Global setup for the E2E configs: on Linux every Electron window a test opens
 * goes to a virtual screen of its own, never the developer's desktop, where
 * ~320 windows would each take focus. `LEATHERCAD_E2E_HEADED=1` shows them, as
 * does Playwright's inspector (`PWDEBUG`), which would otherwise open there too.
 *
 * 2560 x 1600 at 24 bits: larger than any window a test asks for (1920 x 1280),
 * because Chromium on X11 takes a pixel off a window exactly the screen's size,
 * and a 1920 x 1080 one measured 1919 in `resizeWindow`. 24 bits because
 * Xvfb's default depth of 8 bands every colour.
 * GitHub Actions brings its own through `xvfb-run`, so CI runs as it did.
 *
 * The run also yields the CPU to the desktop: niceness 10, which every worker,
 * Electron and Xvfb inherit. It changes nothing on an idle machine; on a busy
 * one the suite slows rather than the desktop.
 */
export default async function virtualScreen(): Promise<(() => void) | undefined> {
  const headed =
    process.env['LEATHERCAD_E2E_HEADED'] === '1' || process.env['PWDEBUG'] !== undefined;
  if (process.platform !== 'linux' || headed || process.env['GITHUB_ACTIONS'] === 'true') {
    return undefined;
  }
  // Never raises it: a run started under `nice -n 15` stays there.
  setPriority(Math.max(getPriority(), 10));

  // -displayfd: Xvfb picks a free display and writes its number once it accepts clients.
  const xvfb = spawn(
    'Xvfb',
    ['-displayfd', '1', '-screen', '0', '2560x1600x24', '-nolisten', 'tcp'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  let errors = '';
  xvfb.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()));
  const display = await new Promise<string>((resolve, reject) => {
    xvfb.once('error', (error) =>
      reject(
        new Error(
          `E2E on Linux runs on a virtual screen, and Xvfb could not start (${error.message}). ` +
            'Install it — xorg-server-xvfb (Arch), xvfb (Debian, Ubuntu), xorg-x11-server-Xvfb (Fedora) — ' +
            'or set LEATHERCAD_E2E_HEADED=1 to open the windows on your own screen.',
        ),
      ),
    );
    xvfb.once('exit', (code) =>
      reject(new Error(`Xvfb exited (${code}) before it was ready:\n${errors}`)),
    );
    xvfb.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('\n')) resolve(`:${output.trim()}`);
    });
  });
  xvfb.removeAllListeners('exit');

  // Electron picks Wayland on a Wayland session whatever DISPLAY says.
  process.env['DISPLAY'] = display;
  process.env['XDG_SESSION_TYPE'] = 'x11';
  delete process.env['WAYLAND_DISPLAY'];
  return () => {
    xvfb.kill();
  };
}
