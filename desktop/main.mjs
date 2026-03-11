import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, shell } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let desktopServerStop = null;

function createWindow(apiBase) {
  process.env.ARCHIVE_FINDER_API_BASE = apiBase;

  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1220,
    minHeight: 820,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#07121b',
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (app.isPackaged) {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'client', 'dist', 'index.html'));
  } else {
    void mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

async function resolveApiBase() {
  process.env.ARCHIVE_FINDER_APP_ROOT = app.getAppPath();
  process.env.ARCHIVE_FINDER_DATA_DIR = app.getPath('userData');

  if (!app.isPackaged) {
    return 'http://127.0.0.1:4000';
  }

  process.env.ARCHIVE_FINDER_STANDALONE = process.env.ARCHIVE_FINDER_STANDALONE || '1';
  const serverModuleUrl = pathToFileURL(path.join(app.getAppPath(), 'server', 'dist', 'desktopBundle.mjs')).href;
  const { startDesktopServer, stopDesktopServer } = await import(serverModuleUrl);
  const apiBase = await startDesktopServer(4000);
  desktopServerStop = stopDesktopServer;
  return apiBase;
}

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    if (desktopServerStop) {
      await desktopServerStop();
      desktopServerStop = null;
    }
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (desktopServerStop) {
    await desktopServerStop();
    desktopServerStop = null;
  }
});

app.whenReady().then(async () => {
  const apiBase = await resolveApiBase();
  createWindow(apiBase);

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextApiBase = desktopServerStop ? process.env.ARCHIVE_FINDER_API_BASE ?? apiBase : await resolveApiBase();
      createWindow(nextApiBase);
    }
  });
}).catch((error) => {
  console.error('[desktop] failed to start', error);
  app.quit();
});
