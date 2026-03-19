export type EntityType = 'Resume' | 'Job';

type EntityRouteMode = 'legacy_query' | 'app_path';

function getEntityRouteModeFromEnv(): EntityRouteMode | null {
  const raw = import.meta.env.VITE_ENTITY_ROUTE_MODE;
  if (raw === 'legacy_query' || raw === 'app_path') return raw;
  return null;
}

function getFrontendHostFromEnv(): string | null {
  const raw = import.meta.env.VITE_FRONTEND_HOST;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed;
}

function normalizeHost(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';

  // If user passes full URL like https://app.mesoor.com, extract hostname.
  try {
    const u = new URL(trimmed);
    return u.host;
  } catch {
    return trimmed.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

/**
 * 根据 host 自动推断实体详情页路由模式（兜底逻辑）
 *
 * ⚠️ 重要提示：
 * - 此函数仅作为兜底逻辑，当 VITE_ENTITY_ROUTE_MODE 未显式配置时才会调用
 * - 推断规则基于 Mesoor 官方域名命名约定，可能不适用于所有客户本地部署场景
 *
 * 推断规则：
 * - 如果 host 是 app.mesoor.com 或以 app. / app- 开头 -> 返回 'app_path'（新前端路由）
 * - 其他情况 -> 返回 'legacy_query'（旧路由）
 *
 * 适用场景：
 * - Mesoor 官方环境（app.mesoor.com / tip.mesoor.com 等）
 * - 遵循 app.* 或 app-* 命名约定的客户部署
 *
 * 不适用场景（必须显式配置 VITE_ENTITY_ROUTE_MODE）：
 * - 客户本地部署使用非 app.* 命名的新前端（如 hr.company.com）
 * - 任何不符合上述推断规则的自定义域名
 *
 * @param host - 已规范化的 host 字符串
 * @returns 'app_path' 或 'legacy_query'
 */
function detectEntityRouteModeByHost(host: string): EntityRouteMode {
  const h = normalizeHost(host).toLowerCase();

  // New frontend (and most local deployments) typically use an app-* or app. host.
  // Examples:
  // - app.mesoor.com
  // - app-xxx.mesoor.com
  // - app.company.com
  if (h === 'app.mesoor.com') return 'app_path';
  if (h.startsWith('app.')) return 'app_path';
  if (h.startsWith('app-')) return 'app_path';

  return 'legacy_query';
}

export function buildEntityDetailUrl(params: {
  host: string;
  entityType: EntityType;
  openId: string;
}): string {
  const host = normalizeHost(getFrontendHostFromEnv() ?? params.host);
  const mode = getEntityRouteModeFromEnv() ?? detectEntityRouteModeByHost(host);

  if (mode === 'app_path') {
    return `https://${host}/entity/${params.entityType}/${params.openId}`;
  }

  return `https://${host}/entity/${params.openId}?type=${params.entityType}`;
}
