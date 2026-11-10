import { app, BrowserWindow, shell, utilityProcess } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { openDb } from '@tycho/db';
import { IPC } from '@tycho/core';
import { registerIpc } from './ipc';
import { createTray } from './tray';
import type { WorkerEvent } from './worker-protocol';

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
  const dbPath = path.join(app.getPath('userData'), 'tycho.db');
  // Main migrates first, then only reads; the ingest worker is the single writer.
  const db = openDb(dbPath);
  registerIpc(db);
  const refreshTray = createTray(db, () => win ?? createWindow());
  createWindow();

  // Change events are coalesced so the renderer refreshes at most ~4 times a second.
  const pending = new Set<'usage' | 'sessions' | 'sources'>();
  let flush: NodeJS.Timeout | null = null;
  const notify = (topic: 'usage' | 'sessions' | 'sources') => {
    pending.add(topic);
    flush ??= setTimeout(() => {
      flush = null;
      refreshTray();
      for (const t of pending) win?.webContents.send(IPC.change, t);
      pending.clear();
    }, 250);
  };

  const worker = utilityProcess.fork(path.join(__dirname, 'ingest-worker.cjs'), [dbPath], { serviceName: 'Tycho ingest' });
  worker.on('message', (e: WorkerEvent) => {
    if (e.type === 'changed') notify(e.topic);
    else if (e.type === 'error') console.error(`[ingest] ${e.harness}: ${e.message}`);
    else if (e.type === 'ready') notify('sources');
  });
  worker.on('exit', (code) => console.error(`[ingest] worker exited with ${code}`));
  app.on('before-quit', () => worker.kill());
  // "Running" is time-based, so refresh the tray even when nothing new arrives.
  setInterval(() => notify('usage'), 60_000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
