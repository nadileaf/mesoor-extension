import { combineLatest, concat, from, of, timer } from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  map,
  scan,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs/operators';
import type { Cookies } from 'webextension-polyfill';
import browser from 'webextension-polyfill';
import { LocalStorage, TipUser, FSGUser } from '../interfaces/storage.ts';

import { parseJwt } from '../utils/user-utils';
import { localstorageChange$ } from './storage';
import { onCookiesChange$ } from './stream';
import { isTokenExpired } from '../utils/fsg-user-utils';

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

const getCookieQuery = (url: string): Cookies.GetAllDetailsType => {
  // 使用 { url } 精确查询，避免 getDomain 提取父域名后
  // 导致 tip-test.nadileaf.com 和 inzight.nadileaf.com 互相串 token
  return { url };
};

const tokenCookieNames = ['access_token', 'token'];
const extensionDefaultToken =
  import.meta.env.VITE_EXTENSION_DEFAULT_TOKEN?.trim();

// WebSocket 身份标识字段，可通过环境变量配置
// 'token' (默认): token变化时重连
// 'sub': JWT sub字段变化时重连（适合token频繁刷新的环境）
const wsIdentityKey = import.meta.env.VITE_WS_IDENTITY_KEY || 'token';

// 鉴权模式：cookie | storage_token
const authMode = import.meta.env.VITE_AUTH_MODE || 'cookie';

function compareUserIdentity(pre: TipUser, cur: TipUser): boolean {
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
 * current sync storage stream
 */
// TODO 按照这个user流来说，当用户退出或者清除cookie的时候，socket不会断开连接并且手抓以及自动搜都还可以继续使用。
// 租户token都是使用断开连接之前的，因为这个cookiechange代表着改变，谁改变这个cookie就是谁(即就算被清除了也算是change)，而scan又会返回之前的值
// 所以user流里的返回值有着较大缺陷(distinctUntilChanged不会让你重复触发连续一样的流的值)，只有在刚安装插件时才奏效，一旦登录过后，退出登录后仍可继续使用直至浏览器完全退出(进程全部结束)。
// 如果想要修改这个，加一个新流和一个新的storage，在cookiechange的时候查询所有相关cookie，少了一个就设置这个storage，同时socket$流combineLast里面多加入一个流即可。
const cookieUser$ = env$.pipe(
  switchMap(_env => {
    const cookieQuery = getCookieQuery(import.meta.env.VITE_TOKEN_HOST);
    const getCookies = browser.cookies.getAll(cookieQuery);
    return concat(
      from(getCookies).pipe(
        // 将所有 cookies 收集到数组中
        map(cookies => cookies.filter(c => tokenCookieNames.includes(c.name))),
        // 解析所有 token 并按 iat 时间戳排序，取最新的
        map(tokenCookies => {
          if (tokenCookies.length === 0) return [];

          const parsedTokens = tokenCookies.map(cookie => {
            let decodedValue = decodeURIComponent(cookie.value);
            try {
              decodedValue = JSON.parse(decodedValue);
            } catch (_e) {
              // 解析失败，使用原值
            }
            const parsed = parseJwt(decodedValue);
            return {
              cookie,
              parsed,
              token: decodedValue,
              iat: parsed.iat || 0,
            };
          });

          parsedTokens.sort((a, b) => {
            const namePriority =
              tokenCookieNames.indexOf(a.cookie.name) -
              tokenCookieNames.indexOf(b.cookie.name);
            if (namePriority !== 0) {
              return namePriority;
            }
            return b.iat - a.iat;
          });
          return parsedTokens.length > 0 ? [parsedTokens[0].cookie] : [];
        }),
        // 展开数组
        switchMap(cookies => from(cookies))
      ),
      onCookiesChange$(import.meta.env.VITE_TOKEN_HOST).pipe(
        filter(cookie => tokenCookieNames.includes(cookie.name))
      )
    );
  }),
  scan((user: Partial<TipUser>, cookie: Cookies.Cookie) => {
    const { value } = cookie;
    let decodedValue = decodeURIComponent(value);

    try {
      decodedValue = JSON.parse(decodedValue);
    } catch (_e) {
      // 解析失败，使用原值
    }
    const tipUser = {
      ...parseJwt(decodedValue),
      token: decodedValue,
    };
    return { ...user, ...tipUser };
  }, {})
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

    // 检查 token 是否过期
    if (isTokenExpired(fsgUser.token)) {
      console.log('[storageUser$] token 已过期，返回 null');
      return null;
    }

    // 解析 JWT 获取用户信息
    const jwtPayload = parseJwt(fsgUser.token);
    console.log('[storageUser$] 解析 JWT payload:', jwtPayload);

    return {
      ...jwtPayload,
      token: fsgUser.token,
    };
  }),
  tap(user => console.log('[storageUser$] 最终用户对象:', user))
);

export const user$ = extensionDefaultToken
  ? of({
      ...parseJwt(extensionDefaultToken),
      token: extensionDefaultToken,
    }).pipe(
      filter(isUser),
      distinctUntilChanged(compareUserIdentity),
      shareReplay(1)
    )
  : authMode === 'storage_token'
    ? storageUser$.pipe(
        filter((user): user is TipUser => user !== null),
        filter(isUser),
        distinctUntilChanged(compareUserIdentity),
        shareReplay(1)
      )
    : cookieUser$.pipe(
        filter(isUser),
        distinctUntilChanged(compareUserIdentity),
        shareReplay(1)
      );

export const isLogin = async (env: string): Promise<Map<string, string>> => {
  const cookies = await browser.cookies.getAll(getCookieQuery(env));
  let cookieObj: Map<string, string> = new Map();
  cookies.forEach(cookie => {
    if (tokenCookieNames.includes(cookie.name)) {
      cookieObj.set(cookie.name, cookie.value);
    }
  });
  return cookieObj;
};

// 定时检查用户是否登录（host/id/token是否都在）
export const userCookieCheck$ = combineLatest(
  env$,
  timer(1000 * 10, 1000 * 60 * 60)
) // 启动后的十秒，以及之后的每小时检测一次
  .pipe(
    switchMap(async ([env]) => {
      if (!env) {
        return false;
      }
      const _isLogin = await isLogin(env);
      return _isLogin.size === 1;
    })
  );

function isUser(user: object): user is TipUser {
  return 'token' in user && typeof (user as TipUser).token === 'string';
}

export const clearUserCookie = () => {
  return new Promise((resolve, reject) => {
    const envSubscribe = env$.subscribe(async env => {
      try {
        if (!env) {
          reject(new Error('env is not available'));
          return;
        }
        const domain = env;

        await Promise.all(
          tokenCookieNames.map(name =>
            browser.cookies.remove({
              url: `https://${domain}/`,
              name,
            })
          )
        );
        const query = await browser.tabs.query({
          url: `https://${domain}/*`,
        });
        query.map(tab => {
          browser.tabs.reload(tab.id);
        });
        envSubscribe.unsubscribe();
        resolve(true);
      } catch (err) {
        reject(err);
      }
    });
  });
};

export const getDeafultUserStream = (defaultUser: TipUser) => {
  return env$.pipe(switchMap(async _ => defaultUser));
};
