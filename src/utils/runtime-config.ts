import browser from 'webextension-polyfill';

/**
 * 运行时配置。
 *
 * 构建期由 `.env.{mode}` 提供默认值；打包后可通过扩展根目录的 `config.json`
 * 覆盖（本地/私有部署改域名用，无需重新构建）。
 */
export interface RuntimeConfig {
  /** 新前端基址，例如 https://platform.nadileaf.com */
  platformBaseUrl: string;
  /** 用户服务反向代理前缀（platform-access-token cookie 的 path） */
  userServicePrefix: string;
  /** 平台 access token 所在的 cookie 名 */
  tokenCookieName: string;
  wsServer: string;
  backgroundServerHost: string;
  domainHost: string;
  actionConfigHost: string;
  agentHost: string;
  updateCdnBaseUrl: string;
  sourcingAgentUrl: string;
}

const env = import.meta.env;

const ENV_DEFAULTS: RuntimeConfig = {
  platformBaseUrl: env.VITE_PLATFORM_BASE_URL || env.VITE_TOKEN_HOST || '',
  userServicePrefix: env.VITE_USER_SERVICE_PREFIX || '/api/user-proxy',
  tokenCookieName: env.VITE_TOKEN_COOKIE_NAME || 'platform-access-token',
  wsServer: env.VITE_WS_SERVER || '',
  backgroundServerHost: env.VITE_BACKGROUND_SERVER_HOST || '',
  domainHost: env.VITE_DOMAIN_HOST || '',
  actionConfigHost: env.VITE_ACTION_CONFIG_HOST || '',
  agentHost: env.VITE_AGENT_HOST || '',
  updateCdnBaseUrl: env.VITE_UPDATE_CDN_BASE_URL || '',
  sourcingAgentUrl: env.VITE_SOURCING_AGENT_URL || '',
};

const STRING_KEYS: Array<keyof RuntimeConfig> = [
  'platformBaseUrl',
  'userServicePrefix',
  'tokenCookieName',
  'wsServer',
  'backgroundServerHost',
  'domainHost',
  'actionConfigHost',
  'agentHost',
  'updateCdnBaseUrl',
  'sourcingAgentUrl',
];

let current: RuntimeConfig = { ...ENV_DEFAULTS };
let loading: Promise<RuntimeConfig> | null = null;

function pick(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * 读取扩展内的 config.json（只读一次，带缓存），与构建期默认值合并。
 */
export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await fetch(browser.runtime.getURL('config.json'), {
        cache: 'no-store',
      });
      if (!res.ok) return current;
      const raw = (await res.json()) as Record<string, unknown>;
      const merged: RuntimeConfig = { ...ENV_DEFAULTS };
      for (const key of STRING_KEYS) {
        const value = pick(raw[key]);
        if (value) merged[key] = value;
      }
      merged.platformBaseUrl = normalizeBaseUrl(merged.platformBaseUrl);
      current = merged;
    } catch (error) {
      console.warn(
        '[runtime-config] 读取 config.json 失败，使用构建期默认值',
        error
      );
    }
    return current;
  })();
  return loading;
}

/** 同步读取已加载的配置（未加载时返回构建期默认值）。 */
export function getRuntimeConfig(): RuntimeConfig {
  return current;
}
