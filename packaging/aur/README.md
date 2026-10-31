# AUR package: `leathercad-bin`

LeatherCAD for Arch Linux, built from the AppImage that a release attaches. `yay -S leathercad-bin`
(or any other AUR helper) installs it. Unlike the AppImage it needs no FUSE, and it puts LeatherCAD
in the applications menu with `.lcp` files associated.

"Bin" means the package unpacks the release and compiles nothing, so the bytes a maker installs
are the bytes the release workflow built, and the maintainer's print check measures that file
([`docs/release-checklist.md`](../../docs/release-checklist.md)).

What the package does (`PKGBUILD`):

- downloads `LeatherCAD-<version>-x86_64.AppImage` from the release `leathercad-v<version>` and
  unpacks it with `--appimage-extract`, which needs no FUSE;
- installs the unpacked app in `/opt/leathercad`, with `/usr/bin/leathercad` linked to it;
- installs the desktop entry (the AppImage's, with `Exec=leathercad %U`), the hicolor icons, and the
  `.lcp` type from `apps/desktop/build/linux/io.github.crnlsp.leathercad.xml` at the same tag —
  the AppImage's own copy of the type has no content sniffing;
- leaves out what only the AppImage needs: `AppRun` and the libraries in its `usr/lib`.

`depends` are the libraries the Electron binary links against, plus `cups` (Print runs `lp` and
`lpstat`) and `xdg-utils` (opening a link). `namcap` flags `cups` and `xdg-utils` as perhaps not
needed, because it cannot see a program that is run rather than linked; and an ELF file under
`/opt`, which is where a `-bin` package of an Electron app puts it.

## Releasing a new version

Not automatic: the maintainer does this after a release.

1. In `PKGBUILD`, set `pkgver` to the release's version, and `pkgrel=1`.
2. `updpkgsums` rewrites `sha256sums` from the two downloads.
3. `makepkg --printsrcinfo > .SRCINFO`.
4. Build it in a folder of its own, so the repository stays clean:

   ```bash
   makepkg -f --nocheck
   namcap PKGBUILD leathercad-bin-*.pkg.tar.zst
   ```

   Install it with `makepkg -si` or `pacman -U`, start LeatherCAD from the menu, and open a `.lcp`
   by double-click.
5. Commit `PKGBUILD` and `.SRCINFO` here, then push the same two files to the AUR (below).

A change to the packaging alone — not the version — raises `pkgrel` by one.

## First publication

Once, by the maintainer. An AUR account is not something CI or an agent creates.

1. Create an account on <https://aur.archlinux.org>, and add an SSH public key to it.
2. `git clone ssh://aur@aur.archlinux.org/leathercad-bin.git`. It is empty, and git says so.
3. Copy `PKGBUILD` and `.SRCINFO` into it, then:

   ```bash
   git checkout -B master
   git add PKGBUILD .SRCINFO
   git commit -m "leathercad-bin 1.5.0"
   git push origin master
   ```

   The AUR takes the branch `master` and nothing else.

## What to know

- **The sandbox.** The app starts with Electron's own sandbox, through unprivileged user
  namespaces, which Arch's kernels have on. The AppImage turns the sandbox off where it finds them
  missing; this package does not. On a kernel without them (`linux-hardened`), start it with
  `leathercad --no-sandbox`.
- **Updates.** *Check for updates* in the app announces a new release as it does for the AppImage,
  and the package catches up when the maintainer pushes the new version. Update with the AUR
  helper, not from the app.
- **Only x86_64.** Linux on ARM is not supported ([`getting-started.md`](../../docs/getting-started.md#supported-systems)).
