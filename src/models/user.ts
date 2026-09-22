import { combineLatest, concat, from, of, timer, Observable } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs/operators';
import browser from 'webextension-polyfill';
import { LocalStorage, TipUser, FSGUser } from '../interfaces/storage.ts';

import { parseJwt } from '../utils/user-utils';
import { localstorageChange$ } from './storage';
import { onCookiesChangeInfo$ } from './stream';
import { isTokenExpired } from '../utils/fsg-user-utils';
import { getRuntimeConfig, loadRuntimeConfig } from '../utils/runtime-config';

// env$
export const fromStorage$ = from(
  browser.storage.local.get('env') as Promise<LocalStorage>
).pipe(
  tap(storage => console.log('[user$ fromStorage$] 获取到 storage:', storage)),
  filter(storage => !!storage.env),
  map(storage => storage.env!),
  tap(env => console.log('[user$ fromStorage$] 提取出 env:', env))
);

const envChange$ = localstorageChange$.pipe(
  // filter only sync storage
  filter(([change]) => !!change.env),
  // get newValue object
  map(([change]) => change.env!.newValue)
);

export const env$ = concat(fromStorage$, envChange$).pipe(shareReplay(1));

// 平台 access token 所在的 cookie（新前端方案）：
// 服务端每次刷新都会重设 platform-access-token，扩展只被动读取，不主动刷新。
// 兼容旧的 access_token / token cookie，按优先级取。
const FALLBACK_TOKEN_COOKIE_NAMES = ['access_token', 'token'];

// 平台 access token cookie 名可由 config.json 配置，默认 platform-access-token；
// 兼容旧的 access_token / token，按优先级取。
function tokenCookieNames(): string[] {
  const primary = getRuntimeConfig().tokenCookieName || 'platform-access-token';
  return [primary, ...FALLBACK_TOKEN_COOKIE_NAMES].filter(
    (name, index, all) => !!name && all.indexOf(name) === index
  );
}
const extensionDefaultToken =
  import.meta.env.VITE_EXTENSION_DEFAULT_TOKEN?.trim();

// WebSocket 身份标识字段，可通过环境变量配置
// 'token' (默认): token变化时重连
// 'sub': JWT sub字段变化时重连（适合token频繁刷新的环境）
const wsIdentityKey = import.meta.env.VITE_WS_IDENTITY_KEY || 'token';

// 鉴权模式：cookie | storage_token
const authMode = import.meta.env.VITE_AUTH_MODE || 'cookie';

/**
 * token cookie 的查询地址。
 * 带上 userServicePrefix 路径，才能命中 path=/api/user-proxy 的 platform-access-token；
 * 对旧 host 无害（path=/ 的 cookie 任意路径都能命中）。
 */
function getTokenQueryUrl(): string {
  const cfg = getRuntimeConfig();
  const base = cfg.platformBaseUrl || import.meta.env.VITE_TOKEN_HOST;
  const prefix = (cfg.userServicePrefix || '').replace(/\/+$/, '');
  return `${base}${prefix}/`;
}

function safeParseJwt(token: unknown): TipUser | null {
  if (typeof token !== 'string') return null;
  try {
    return parseJwt(token);
  } catch (error) {
    console.warn('[user$] 解析 JWT 失败:', error);
    return null;
  }
}

function decodeCookieValue(value: string): string {
  let decoded = decodeURIComponent(value);
  try {
    decoded = JSON.parse(decoded);
  } catch {
    // 解析失败，使用原值（JWT 字符串）
  }
  return decoded;
}

/**
 * 查询当前所有相关 token cookie，按优先级与 iat 取最新可用的一个。
 * 没有可用 token（未登录/已过期/被清除）时返回 null —— 用于驱动登出。
 */
async function readTokenUser(): Promise<TipUser | null> {
  try {
    const names = tokenCookieNames();
    const cookies = await browser.cookies.getAll({ url: getTokenQueryUrl() });
    const tokenCookies = cookies.filter(c => names.includes(c.name));
    if (tokenCookies.length === 0) return null;

    const parsed = tokenCookies
      .map(cookie => {
        const token = decodeCookieValue(cookie.value);
        const payload = safeParseJwt(token);
        return { cookie, token, payload, iat: payload?.iat || 0 };
      })
      .filter(item => !!item.payload);

    if (parsed.length === 0) return null;

    parsed.sort((a, b) => {
      const namePriority =
        names.indexOf(a.cookie.name) - names.indexOf(b.cookie.name);
      if (namePriority !== 0) return namePriority;
      return b.iat - a.iat;
    });

    const best = parsed[0];
    return { ...best.payload!, token: best.token as string };
  } catch (error) {
    console.error('[user$] 读取 token cookie 失败:', error);
    return null;
  }
}

function compareUserIdentity(
  pre: TipUser | null,
  cur: TipUser | null
): boolean {
  if (!pre || !cur) return pre === cur;

  // 先比较租户信息，租户变化必须重连
  if (pre.tenantAlias !== cur.tenantAlias || pre.tenantId !== cur.tenantId) {
    return false;
  }

  if (wsIdentityKey === 'sub') {
    if (pre.sub && cur.sub) {
      return pre.sub === cur.sub;
    }
  }
  // 默认或 fallback 回退到 token 比较
  return pre.token === cur.token;
}

/**
 * 从 cookie 读取用户：初始查询 + 监听 cookie 变化重新查询。
 * 变化（刷新轮换、切换租户、登出删除）都会重新计算，登出时发出 null。
 */
const cookieUser$: Observable<TipUser | null> = from(loadRuntimeConfig()).pipe(
  switchMap(() =>
    concat(
      from(readTokenUser()),
      onCookiesChangeInfo$(getTokenQueryUrl()).pipe(
        filter(info => tokenCookieNames().includes(info.cookie.name)),
        debounceTime(50),
        switchMap(() => from(readTokenUser()))
      )
    )
  )
);

// Storage token 模式：从 chrome.storage.local.fsgUser 读取 token
const storageUser$ = concat(
  from(browser.storage.local.get('fsgUser') as Promise<LocalStorage>).pipe(
    tap(storage => console.log('[storageUser$] 获取到 storage:', storage)),
    map(storage => storage.fsgUser),
    tap(fsgUser => console.log('[storageUser$] 提取出 fsgUser:', fsgUser))
  ),
  localstorageChange$.pipe(
    filter(([change]) => !!change.fsgUser),
    map(([change]) => (change.fsgUser as { newValue?: FSGUser }).newValue)
  )
).pipe(
  map((fsgUser: FSGUser | undefined): TipUser | null => {
    if (!fsgUser) {
      console.log('[storageUser$] fsgUser 不存在，返回 null');
      return null;
    }

    if (isTokenExpired(fsgUser.token)) {
      console.log('[storageUser$] token 已过期，返回 null');
      return null;
    }

    const jwtPayload = safeParseJwt(fsgUser.token);
    if (!jwtPayload) return null;

    return { ...jwtPayload, token: fsgUser.token };
  })
);

export const user$: Observable<TipUser | null> = extensionDefaultToken
  ? of({
      ...safeParseJwt(extensionDefaultToken),
      token: extensionDefaultToken,
    } as TipUser).pipe(
      distinctUntilChanged(compareUserIdentity),
      shareReplay(1)
    )
  : authMode === 'storage_token'
    ? storageUser$.pipe(
        distinctUntilChanged(compareUserIdentity),
        shareReplay(1)
      )
    : cookieUser$.pipe(
        distinctUntilChanged(compareUserIdentity),
        shareReplay(1)
      );

export const isLogin = async (_env?: string): Promise<Map<string, string>> => {
  const cookies = await browser.cookies.getAll({ url: getTokenQueryUrl() });
  const cookieObj: Map<string, string> = new Map();
  cookies.forEach(cookie => {
    if (tokenCookieNames().includes(cookie.name)) {
      cookieObj.set(cookie.name, cookie.value);
    }
  });
  return cookieObj;
};

// 定时检查用户是否登录（token cookie 是否存在）
export const userCookieCheck$ = combineLatest([
  from(loadRuntimeConfig()),
  timer(1000 * 10, 1000 * 60 * 60),
]).pipe(
  // 启动后的十秒，以及之后的每小时检测一次
  switchMap(async () => {
    try {
      const _isLogin = await isLogin();
      return _isLogin.size > 0;
    } catch {
      return false;
    }
  })
);

export const clearUserCookie = () => {
  const cfg = getRuntimeConfig();
  const base = cfg.platformBaseUrl || import.meta.env.VITE_TOKEN_HOST;

  return Promise.all(
    tokenCookieNames().map(name =>
      browser.cookies.remove({ url: `${base}/`, name }).catch(() => undefined)
    )
  );
};

export const getDeafultUserStream = (defaultUser: TipUser) => {
  return env$.pipe(switchMap(async _ => defaultUser));
};
