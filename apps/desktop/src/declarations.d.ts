/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';
interface Window {
  tycho: import('@tycho/core').TychoApi;
}
