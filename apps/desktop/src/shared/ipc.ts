/**
 * IPC channel names, shared by the main process and the preload script.
 *
 * One constant per PlatformHost method. Keeping them in one place is what stops
 * a typo in a channel name becoming a silent no-op.
 */
export const IPC = {
  readFile: 'platform:readFile',
  writeFile: 'platform:writeFile',
  showOpenDialog: 'platform:showOpenDialog',
  showSaveDialog: 'platform:showSaveDialog',
  openInExternalViewer: 'platform:openInExternalViewer',
  getUserConfigDir: 'platform:getUserConfigDir',
  getAppVersion: 'platform:getAppVersion',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
