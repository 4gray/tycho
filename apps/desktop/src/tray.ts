import { Tray, Menu, nativeImage, type BrowserWindow } from 'electron';
import { queries } from '@tycho/db';
import type BetterSqlite3 from 'better-sqlite3';

const usd = (n: number) => `$${n.toFixed(2)}`;

export function createTray(db: BetterSqlite3.Database, show: () => BrowserWindow): () => void {
  const tray = new Tray(nativeImage.createEmpty());
  const refresh = () => {
    const o = queries.overview(db);
    tray.setTitle(usd(o.costToday));
    tray.setToolTip(`Tycho: ${usd(o.costToday)} today (API-equivalent)`);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `${usd(o.costToday)} today, API-equivalent`, enabled: false },
        { label: `${o.liveCount} running`, enabled: false },
        { type: 'separator' },
        { label: 'Open Tycho', click: () => show().focus() },
        { role: 'quit' },
      ]),
    );
  };
  refresh();
  return refresh;
}
