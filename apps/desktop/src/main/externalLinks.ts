/**
 * Whether a URL a window asked to open may go to the system browser.
 *
 * Nothing in LeatherCAD links out today, so the window-open handler exists to
 * refuse. What it lets through is `https:` and nothing else: `shell.openExternal`
 * hands a URL to whatever the operating system registered for its scheme, and
 * `file:`, `smb:`, `javascript:` or a custom handler would turn a link into
 * opening a local file, mounting a share or running another program. A URL
 * that does not parse is refused too.
 */
export function mayOpenExternally(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && parsed.hostname !== '';
}
