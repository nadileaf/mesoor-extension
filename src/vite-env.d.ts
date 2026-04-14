/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_SERVER: string;
  readonly VITE_BACKGROUND_SERVER_HOST: string;
  readonly VITE_TOKEN_HOST: string;
  readonly VITE_SPACE_SERVER: string;
  readonly VITE_ENTITY_ROUTE_MODE?: 'legacy_query' | 'app_path';
  readonly VITE_FRONTEND_HOST?: string;
  readonly VITE_LOCALHOST_API_HOST?: string;
  readonly VITE_ACTION_CONFIG_HOST?: string;
  readonly VITE_UPDATE_CDN_BASE_URL: string;
  readonly VITE_SOURCING_AGENT_URL: string;
  readonly VITE_ENABLE_SOURCING_CHAT?: string;
  readonly VITE_ICON_PATH?: string;
  readonly VITE_EFFEX_CONFIGS_URL: string;
  readonly VITE_DIFY_JOB_CHECK_API_KEY: string;
  readonly VITE_DIFY_LINKEDIN_EMAIL_API_KEY: string;
  readonly VITE_DIFY_LINKEDIN_EMAIL_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
