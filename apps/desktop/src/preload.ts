import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type TychoApi } from '@tycho/core';

const api: TychoApi = {
  overview: () => ipcRenderer.invoke(IPC.overview),
  sessions: (q) => ipcRenderer.invoke(IPC.sessions, q),
  sources: () => ipcRenderer.invoke(IPC.sources),
  onChange: (cb) => {
    const listener = (_e: unknown, topic: Parameters<typeof cb>[0]) => cb(topic);
    ipcRenderer.on(IPC.change, listener);
    return () => ipcRenderer.off(IPC.change, listener);
  },
};

contextBridge.exposeInMainWorld('tycho', api);
