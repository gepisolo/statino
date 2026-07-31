/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  // Deployment label rendered in the sidebar footer. Empty / unset
  // falls back to "production" at runtime.
  readonly VITE_APP_ENV: string;
  // 'true' in dev points the Fatture in Cloud callable at the local
  // functions emulator (127.0.0.1:5001) instead of the deployed one.
  readonly VITE_FUNCTIONS_EMULATOR: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected by Vite from package.json — see vite.config.ts.
declare const __APP_VERSION__: string;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
