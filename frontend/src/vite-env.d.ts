/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_FORGER_REMOTE_TUNNEL?: string;
  readonly VITE_FORGER_REMOTE_SESSION_ID?: string;
  readonly VITE_FORGER_CLOUD_HANDSHAKE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
