/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';
declare module '*.sql?raw' {
  const sql: string;
  export default sql;
}
interface Window {
  tycho: import('@tycho/core').TychoApi;
}
