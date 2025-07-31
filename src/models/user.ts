import browser from "webextension-polyfill";
import { from, concat, timer, combineLatest, BehaviorSubject, of } from "rxjs";
import { TipUser, LocalStorage } from "../interfaces/storage.ts";
import {
  map,
  filter,
  shareReplay,
  concatAll,
  scan,
  switchMap,
  distinctUntilChanged,
  tap,
  catchError,
  debounceTime,
  share,
  withLatestFrom,
} from "rxjs/operators";
import { onCookiesChange$ } from "./stream";
import { localstorageChange$ } from "./storage";
import { parseJwt, getDomain } from "../utils/user-utils";

// env$
// 安全地访问browser.storage.local
let fromStorage$;
try {
  if (browser && browser.storage && browser.storage.local) {
    fromStorage$ = from(
      browser.storage.local.get("env") as Promise<LocalStorage>
    ).pipe(
      filter((storage) => !!storage.env),
      map((storage) => storage.env!)
    );
    console.log("成功初始化storage.local访问");
  } else {
    console.warn("browser.storage.local不可用，使用空Observable替代");
    // 提供默认环境配置字符串，避免undefined导致的类型错误
    fromStorage$ = of("default-host.com");
  }
} catch (error) {
  console.error("访问browser.storage.local时出错:", error);
  // 提供默认环境配置字符串，避免undefined导致的类型错误
  fromStorage$ = of("default-host.com");
}

const envChange$ = localstorageChange$.pipe(
  // filter only sync storage
  filter(([change]) => !!change.env),
  // get newValue object
  map(([change]) => change.env!.newValue)
);

export const env$ = concat(fromStorage$, envChange$).pipe(shareReplay(1));

/**
 * 用户流
 * 改进版的用户流，解决了原流的问题：
 * 1. 在cookie变化时主动检查所有相关cookie
 * 2. 维护一个独立的登录状态流
 * 3. 当检测到用户退出时，正确更新状态
 */

export async function isLogin(env: string) {
  if (!env) {
    console.warn("环境变量为空，无法检查登录状态");
    return new Map<string, string>();
  }

  const domain = getDomain(env);
  const cookies = await browser.cookies.getAll({ domain });
  console.log("userCookieCheck cookies", cookies);
  let cookieObj: Map<string, string> = new Map();
  cookies.forEach((cookie) => {
    if (["token"].includes(cookie.name)) {
      cookieObj.set(cookie.name, cookie.value);
    }
  });
  return cookieObj;
}

// 定时检查用户是否登录（host/id/token是否都在）
export const userCookieCheck$ = combineLatest(
  env$,
  timer(1000 * 10, 1000 * 60 * 60)
) // 启动后的十秒，以及之后的每小时检测一次
  .pipe(
    switchMap(async ([env]) => {
      if (!env) {
        console.warn("环境变量为空，无法检查登录状态");
        return false;
      }
      // 确保env是字符串类型
      const envStr = typeof env === "string" ? env : JSON.stringify(env);
      const _isLogin = await isLogin(envStr);
      return _isLogin.size === 1;
    })
  );

function isUser(user: {}): user is TipUser {
  return "tenantAlias" in user;
}

// 用户登录状态流
const loginStatus$ = new BehaviorSubject<boolean>(false);

/**
 * 检查用户是否登录的函数
 * 通过查询所有相关cookie来确定用户是否真正登录
 */
async function checkLoginStatus(domain: string): Promise<boolean> {
  try {
    const cookies = await browser.cookies.getAll({ domain });
    const hasToken = cookies.some((cookie) => cookie.name === "token");
    console.log(`检查登录状态: ${domain} - ${hasToken ? "已登录" : "未登录"}`);
    return hasToken;
  } catch (error) {
    console.error("检查登录状态出错:", error);
    return false;
  }
}

/**
 * 用户流
 * 1. 在cookie变化时主动检查所有相关cookie
 * 2. 维护一个独立的登录状态流
 * 3. 当检测到用户退出时，正确更新状态
 */
export const user$ = env$.pipe(
  switchMap((env) => {
    if (!env) {
      console.warn("环境变量为空，使用默认域名");
      return of({} as TipUser); // 返回空用户对象
    }

    // 确保env是字符串类型
    const envStr = typeof env === "string" ? env : JSON.stringify(env);
    const domain = getDomain(envStr);

    // 初始化检查登录状态
    checkLoginStatus(domain).then((isLoggedIn) => {
      loginStatus$.next(isLoggedIn);
    });

    // 监听cookie变化
    const cookieChange$ = onCookiesChange$(domain).pipe(
      tap((cookie: Cookies.Cookie) => {
        if (cookie.name === "token") {
          // 当token cookie变化时，重新检查登录状态
          checkLoginStatus(domain).then((isLoggedIn) => {
            loginStatus$.next(isLoggedIn);
          });
        }
      }),
      filter((cookie: Cookies.Cookie) => ["token"].includes(cookie.name))
    );

    // 获取初始cookie
    const initialCookies$ = from(browser.cookies.getAll({ domain })).pipe(
      concatAll(),
      filter((cookie) => ["token"].includes(cookie.name))
    );

    return concat(initialCookies$, cookieChange$);
  }),
  // 结合登录状态流
  withLatestFrom(loginStatus$),
  filter(([cookie, isLoggedIn]: [Cookies.Cookie, boolean]) => isLoggedIn),
  map(([cookie]: [Cookies.Cookie, boolean]) => cookie),
  scan((user: Partial<TipUser>, cookie: Cookies.Cookie) => {
    const { name, value } = cookie;
    let decodedValue = decodeURIComponent(value);

    try {
      decodedValue = JSON.parse(decodedValue);
    } catch (e) {
      console.log("normal value");
    }

    const tipUser = {
      ...parseJwt(decodedValue),
      token: decodedValue,
    };

    switch (name) {
      case "token":
        return { ...user, ...tipUser };
      default:
        return user;
    }
  }, {}),
  filter(isUser),
  distinctUntilChanged((pre: TipUser, cur: TipUser) => pre.token === cur.token),
  tap((user) => console.log("用户状态更新:", user.tenantAlias)),
  catchError((err) => {
    console.error("用户流处理出错:", err);
    return of({} as TipUser);
  }),
  shareReplay(1)
);

/**
 * 导出登录状态流，可以被其他组件使用
 * 例如：WebSocket连接可以依赖此流来决定是否保持连接
 */
export const isLogin$ = loginStatus$.pipe(
  distinctUntilChanged(),
  debounceTime(300),
  tap((status) => console.log(`登录状态变化: ${status ? "已登录" : "未登录"}`)),
  share()
);

export const getDeafultUserStream = (defaultUser: TipUser) => {
  return env$.pipe(switchMap(async (_) => defaultUser));
};
