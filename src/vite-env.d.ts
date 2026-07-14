/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_SERVER: string;
  readonly VITE_BACKGROUND_SERVER_HOST: string;
  readonly VITE_TOKEN_HOST: string;
  readonly VITE_SPACE_SERVER: string;
  readonly VITE_ENABLE_SOCKET_CONNECTION?: string;
  readonly VITE_ENABLE_AUTO_SYNC_RESUME?: string;
  readonly VITE_ENABLE_AUTO_LINKEDIN_EMAIL?: string;
  readonly VITE_DISABLE_RESUME_SYNC?: string;
  readonly VITE_HIDE_SETTINGS_PANEL?: string;
  readonly VITE_HIDE_RESUME_SYNC?: string;
  readonly VITE_HIDE_VERSION_INFO?: string;
  readonly VITE_HIDE_USAGE_TIPS?: string;
  readonly VITE_ENTITY_ROUTE_MODE?: 'legacy_query' | 'app_path';
  readonly VITE_FRONTEND_HOST?: string;
  readonly VITE_LOCALHOST_API_HOST?: string;
  readonly VITE_ACTION_CONFIG_HOST?: string;
  readonly VITE_UPDATE_CDN_BASE_URL: string;
  readonly VITE_SOURCING_AGENT_URL: string;
  readonly VITE_ENABLE_SOURCING_CHAT?: string;
  readonly VITE_ICON_PATH?: string;
  readonly VITE_NOTIFICATION_ICON?: string;
  readonly VITE_EFFEX_CONFIGS_URL: string;
  readonly VITE_DIFY_JOB_CHECK_API_KEY: string;
  readonly VITE_DIFY_LINKEDIN_EMAIL_API_KEY: string;
  readonly VITE_DIFY_LINKEDIN_EMAIL_HOST: string;
  readonly VITE_EXTENSION_PING_SOURCE: string;
  readonly VITE_EXTENSION_PONG_SOURCE: string;
  readonly VITE_EXTENSION_DEFAULT_TOKEN?: string;
  /**
   * WebSocket连接身份标识字段，决定distinctUntilChanged比较逻辑
   * - 'token': token变化时重连（默认行为）
   * - 'sub': JWT sub字段变化时重连（适合token频繁刷新的环境如inzight）
   */
  readonly VITE_WS_IDENTITY_KEY?: 'token' | 'sub';
  /** 是否将登录 token 写入浏览器 cookie（域名 .mesoor.com），让主站页面免登录 */
  readonly VITE_USER_API_BASE?: string;
  readonly VITE_TENANT_ALIAS?: string;
  readonly VITE_AUTH_MODE?: string;
  readonly VITE_WRITE_TOKEN_TO_COOKIE?: string;
  /** cookie domain，例如 .mesoor.com */
  readonly VITE_TOKEN_COOKIE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
