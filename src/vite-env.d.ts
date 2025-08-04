/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_SERVER: string;
  readonly VITE_BACKGROUND_SERVER_HOST: string;
  readonly VITE_TOKEN_HOST: string;
  readonly VITE_SPACE_SERVER: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
