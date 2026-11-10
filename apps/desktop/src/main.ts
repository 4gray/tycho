import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { openDb } from '@tycho/db';
import { IPC } from '@tycho/core';
import { registerIpc } from './ipc';
import { createTray } from './tray';

if (started) app.quit();

let win: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0b0b0c',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => (win = null));
  // Local-only: never navigate the app window away, open external links in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else void win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  return win;
}

app.whenReady().then(() => {
  const db = openDb(path.join(app.getPath('userData'), 'tycho.db'));
  registerIpc(db);
  const refreshTray = createTray(db, () => win ?? createWindow());
  createWindow();

  // Placeholder heartbeat until the ingest engine (M1) pushes real change events.
  setInterval(() => {
    refreshTray();
    win?.webContents.send(IPC.change, 'usage');
  }, 30_000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
