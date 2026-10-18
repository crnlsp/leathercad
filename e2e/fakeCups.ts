import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * A CUPS client of a test's own, first on the app's PATH (7.6): `lpstat` and
 * `lpoptions` that answer for one A4 printer, and an `lp` that writes down
 * what it was asked and keeps what it was sent. Nothing reaches a real
 * printer. Print previews it; the accessibility scan reads Print with it.
 */

/** A directory of stand-ins for the CUPS client, and where `lp` leaves its job. */
export function fakeCups(lpstat: string): { bin: string; args: string; job: string } {
  const bin = mkdtempSync(join(tmpdir(), 'leathercad-e2e-cups-'));
  const args = join(bin, 'lp-args');
  const job = join(bin, 'job.pdf');
  const tools: Record<string, string> = {
    lpstat,
    lpoptions: `[ "$2" = "LeatherCAD_Test" ] && echo 'PageSize/Media Size: *A4 Letter Custom.WIDTHxHEIGHT'\nexit 0`,
    lp: `printf '%s\\n' "$@" > '${args}'\ncat > '${job}'\necho 'request id is LeatherCAD_Test-7 (1 file(s))'`,
  };
  for (const [name, body] of Object.entries(tools)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return { bin, args, job };
}

export const ONE_PRINTER = `case "$1" in
  -e) echo LeatherCAD_Test ;;
  -d) echo 'system default destination: LeatherCAD_Test' ;;
esac`;
