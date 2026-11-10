#!/bin/sh
# Rebuild every app/tray icon from design/logo/*.svg. Needs macOS (iconutil) for the .icns.
set -eu
cd "$(dirname "$0")/.."
B=design/logo/build
A=apps/desktop/assets
rm -rf "$B" && mkdir -p "$B"
npx electron scripts/rasterize-icons.cjs

S="$B/icon.iconset"; mkdir -p "$S"
for s in 16 32 128 256 512; do
  cp "$B/icon-$s.png" "$S/icon_${s}x${s}.png"
  d=$((s * 2)); [ -f "$B/icon-$d.png" ] && cp "$B/icon-$d.png" "$S/icon_${s}x${s}@2x.png"
done
cp "$B/icon-1024.png" "$S/icon_512x512@2x.png"
iconutil -c icns "$S" -o "$A/icon.icns"

python3 -I - "$B" "$A" <<'PY'
import struct, sys
b, a = sys.argv[1], sys.argv[2]
sizes = [16, 32, 64, 128, 256]
imgs = [open(f'{b}/icon-{s}.png', 'rb').read() for s in sizes]
out, off = b'', 6 + 16 * len(imgs)
for s, d in zip(sizes, imgs):
    out += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(d), off); off += len(d)
open(f'{a}/icon.ico', 'wb').write(struct.pack('<HHH', 0, 1, len(imgs)) + out + b''.join(imgs))
PY

cp "$B/icon-512.png" "$A/icon.png"
cp "$B/trayTemplate.png" "$B/trayTemplate@2x.png" "$A/"
cp "$B/icon-1024.png" design/logo/tycho-icon-1024.png
cp "$B/mark-256.png" design/logo/tycho-mark-256.png
rm -rf "$B"
echo "icons rebuilt"
