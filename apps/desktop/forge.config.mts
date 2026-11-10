import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { cpSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Native modules stay outside the Vite bundle (see vite.main.config.mts), so the packaged app must
 * ship them. better-sqlite3 carries prebuilt Node-API binaries for every platform and has no
 * runtime dependencies, so copying the package is enough.
 */
const NATIVE = ['better-sqlite3'];

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Tycho',
    // Lowercase binary name for Linux packages; the workspace package name (@tycho/desktop) is not valid there.
    executableName: 'tycho',
    // Forge picks icon.icns on macOS and icon.ico on Windows.
    icon: 'assets/icon',
    // .node binaries cannot load from inside an asar archive.
    asar: { unpack: '**/*.node' },
    extraResource: ['assets'],
  },
  hooks: {
    packageAfterCopy: async (_config, buildPath, _electronVersion, platform, arch) => {
      // Only this build's binaries: other platforms' .node files bloat the package and break
      // tools that inspect binaries (rpmbuild's strip fails on ARM files in an x64 build).
      const keep = new Set(platform === 'linux' ? [`linux-${arch}.node`, `linuxmusl-${arch}.node`] : [`${platform}-${arch}.node`]);
      for (const mod of NATIVE) {
        const from = path.dirname(require.resolve(`${mod}/package.json`));
        cpSync(from, path.join(buildPath, 'node_modules', mod), {
          recursive: true,
          filter: (src) => {
            const rel = path.relative(from, src).split(path.sep);
            // Sources, docs and locally compiled output (built for the host, not the target) stay out.
            if (['src', 'deps', 'docs', 'build'].includes(rel[0]!)) return false;
            if (rel[0] === 'prebuilds' && rel.length === 2) return keep.has(rel[1]!);
            return true;
          },
        });
        if (!existsSync(path.join(buildPath, 'node_modules', mod, 'prebuilds', [...keep][0]!))) {
          throw new Error(`${mod} has no prebuilt binary for ${platform}-${arch}`);
        }
      }
    },
  },
  // better-sqlite3 ships Node-API prebuilds that load in Electron as-is; nothing needs compiling.
  rebuildConfig: { onlyModules: [] },
  makers: [
    new MakerSquirrel({ name: 'Tycho', setupExe: 'Tycho-Setup.exe', setupIcon: 'assets/icon.ico' }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({ options: { name: 'tycho', productName: 'Tycho', bin: 'tycho', license: 'MIT', categories: ['Development'], icon: 'assets/icon.png' } }),
    new MakerDeb({ options: { name: 'tycho', productName: 'Tycho', bin: 'tycho', section: 'devel', categories: ['Development'], icon: 'assets/icon.png' } }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/ingest-worker.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
