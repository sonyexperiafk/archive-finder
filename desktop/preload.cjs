const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('archiveFinderRuntime', {
  apiBase: process.env.ARCHIVE_FINDER_API_BASE || '',
  platform: process.platform
});
