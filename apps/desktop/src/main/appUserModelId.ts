/**
 * The name Windows knows LeatherCAD by: its AppUserModelID.
 *
 * Windows groups taskbar buttons, matches a running window to a pinned
 * shortcut, and files the jump list's recent documents by this id, not by the
 * executable. The NSIS installer writes `appId` into every shortcut it makes,
 * so the running app must say the same: left to itself Electron calls it
 * `electron.app.LeatherCAD`, and a window started from a pinned shortcut
 * opened as a second taskbar button with an empty jump list.
 * `packaging.test.ts` holds this equal to `appId` in electron-builder.config.mjs.
 */
export const APP_USER_MODEL_ID = 'io.github.crnlsp.leathercad';
