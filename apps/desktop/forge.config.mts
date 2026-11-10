import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { cpSync } from 'node:fs';
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
    // .node binaries cannot load from inside an asar archive.
    asar: { unpack: '**/*.node' },
    extraResource: ['assets'],
  },
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      for (const mod of NATIVE) {
        const from = path.dirname(require.resolve(`${mod}/package.json`));
        cpSync(from, path.join(buildPath, 'node_modules', mod), {
          recursive: true,
          // Sources and build intermediates are not needed at runtime.
          filter: (src) => !/[\\/](src|deps|docs|build[\\/](?!Release[\\/]better_sqlite3\.node))/.test(path.relative(from, src) ? `/${path.relative(from, src)}` : ''),
        });
      }
    },
  },
  // better-sqlite3 ships Node-API prebuilds that load in Electron as-is; nothing needs compiling.
  rebuildConfig: { onlyModules: [] },
  makers: [
    new MakerSquirrel({ name: 'Tycho', setupExe: 'Tycho-Setup.exe' }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({ options: { name: 'tycho', productName: 'Tycho', bin: 'tycho', license: 'MIT', categories: ['Development'] } }),
    new MakerDeb({ options: { name: 'tycho', productName: 'Tycho', bin: 'tycho', section: 'devel', categories: ['Development'] } }),
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
