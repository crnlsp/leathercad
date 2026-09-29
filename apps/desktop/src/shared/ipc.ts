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
  writeRecovery: 'platform:writeRecovery',
  clearRecovery: 'platform:clearRecovery',
  findRecovery: 'platform:findRecovery',
  resolveRecovery: 'platform:resolveRecovery',
  getRecoveryIntervalMs: 'platform:getRecoveryIntervalMs',
  getPreferences: 'platform:getPreferences',
  setPreferences: 'platform:setPreferences',
  noteRecentFile: 'platform:noteRecentFile',
  readSampleProject: 'platform:readSampleProject',
  takeLaunchFile: 'platform:takeLaunchFile',
  getRecentFiles: 'platform:getRecentFiles',
  openRecent: 'platform:openRecent',
  clearRecent: 'platform:clearRecent',
  showLogFolder: 'platform:showLogFolder',
  openNotices: 'platform:openNotices',
  /** Main → renderer: an item of macOS's menu was chosen (8.5a, 8.7). */
  menuAction: 'menu:action',
  /** Main → renderer: open this project, which the main process granted (8.2). */
  openFile: 'platform:openFile',
} as const;
