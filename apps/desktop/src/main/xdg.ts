/**
 * An XDG base directory, when the app honours it: on Linux always, where it
 * is the platform's own convention; on Windows and macOS only in the
 * development build. There the E2E suite gives every launch a configuration
 * and a state directory of its own through these two variables, as it does on
 * Linux; without them every launch shared one profile, so a second launch
 * ended at the single-instance lock. An installed app on Windows or macOS
 * keeps the platform's own place, whatever the environment says.
 *
 * Unset and empty are the same, as the XDG Base Directory specification
 * reads them.
 */
export function xdgHome(
  name: 'XDG_CONFIG_HOME' | 'XDG_STATE_HOME',
  where: {
    readonly platform: NodeJS.Platform;
    readonly packaged: boolean;
    readonly env: Readonly<Record<string, string | undefined>>;
  },
): string | undefined {
  if (where.platform !== 'linux' && where.packaged) return undefined;
  const value = where.env[name];
  return value === undefined || value === '' ? undefined : value;
}
