interface ImportMetaEnv {
  readonly WS_SERVER: string;
  readonly BACKGROUND_SERVER_HOST: string;
  readonly TOKEN_HOST: string;
  readonly SPACE_SERVER: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}