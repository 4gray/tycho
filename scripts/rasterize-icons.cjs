// Rasterize the logo SVGs with Electron's own renderer (exact alpha and anti-aliasing).
// Usage: npm run icons (runs this, then scripts/build-icons.sh packs .icns / .ico)
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const logo = path.join(root, 'design/logo');
const out = path.join(root, 'design/logo/build');
const jobs = [
  ...[16, 32, 64, 128, 256, 512].map((s) => ({ svg: 'tycho-icon.svg', size: s, file: `icon-${s}.png` })),
  { svg: 'tycho-tray.svg', size: 16, file: 'trayTemplate.png' },
  { svg: 'tycho-tray.svg', size: 32, file: 'trayTemplate@2x.png' },
  { svg: 'tycho-mark.svg', size: 256, file: 'mark-256.png' },
  { svg: 'tycho-icon.svg', size: 1024, file: 'icon-1024.png' },
];

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  for (const j of jobs) {
    const svg = fs.readFileSync(path.join(logo, j.svg), 'utf8');
    const html = `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${j.size}" height="${j.size}" style="display:block"></body></html>`;
    win.setContentSize(j.size, j.size);
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    await new Promise((r) => setTimeout(r, 150));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: j.size, height: j.size });
    fs.writeFileSync(path.join(out, j.file), img.resize({ width: j.size, height: j.size, quality: 'best' }).toPNG());
    console.log('wrote', j.file);
  }
  app.quit();
});
