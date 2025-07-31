import browser from "webextension-polyfill";
import type { Cookies } from "webextension-polyfill";
import { from, concat, timer, combineLatest } from "rxjs";
import {
  TipUser,
  LocalStorage 
} from "../interfaces/storage.ts";
import {
  map,
  filter,
  shareReplay,
  concatAll,
  scan,
  switchMap,
  distinctUntilChanged,
} from "rxjs/operators";

import { onCookiesChange$ } from "./stream";
import { localstorageChange$ } from "./storage";
import { parseJwt, getDomain } from "../utils/user-utils";


// env$
export const fromStorage$ = from(browser.storage.local.get('env') as Promise<LocalStorage>)
  .pipe(
    filter(storage => !!storage.env),
    map(storage => storage.env!)
  )

const envChange$ = localstorageChange$.pipe(
  // filter only sync storage
  filter(([change]) => !!change.env),
  // get newValue object
  map(([change]) => change.env!.newValue)
)

export const env$ = concat(fromStorage$, envChange$).pipe(shareReplay(1))

/**
 * current sync storage stream
 */
// TODO 按照这个user流来说，当用户退出或者清除cookie的时候，socket不会断开连接并且手抓以及自动搜都还可以继续使用。
// 租户token都是使用断开连接之前的，因为这个cookiechange代表着改变，谁改变这个cookie就是谁(即就算被清除了也算是change)，而scan又会返回之前的值
// 所以user流里的返回值有着较大缺陷(distinctUntilChanged不会让你重复触发连续一样的流的值)，只有在刚安装插件时才奏效，一旦登录过后，退出登录后仍可继续使用直至浏览器完全退出(进程全部结束)。
// 如果想要修改这个，加一个新流和一个新的storage，在cookiechange的时候查询所有相关cookie，少了一个就设置这个storage，同时socket$流combineLast里面多加入一个流即可。
export const user$ = env$
  .pipe(
    switchMap(env => {
      const domain = getDomain(env!)
      const getCookies = browser.cookies.getAll(
        { domain }
      )
      return concat(from(getCookies).pipe(concatAll()), onCookiesChange$(domain))
    }),
    filter(cookie => ['token'].includes(cookie.name)),
    scan((user: Partial<TipUser>, cookie: Cookies.Cookie) => {
      const { name, value } = cookie
      let decodedValue = decodeURIComponent(value)
  
      try {
        decodedValue = JSON.parse(decodedValue)
      } catch (e) {
      }
      const tipUser = {
        ...parseJwt(decodedValue),
        token: decodedValue
      }
      switch (name) {
        case 'token':
          return { ...user, ...tipUser }
        default:
          return user
      }
    }, {}),
    filter(isUser),
    distinctUntilChanged(
      (pre: TipUser, cur: TipUser) => pre.token === cur.token
    ),
    shareReplay(1)
  )

export const isLogin = async (env: string): Promise<Map<string, string>> => {
  const cookies = await browser.cookies.getAll(
    { domain: getDomain(env!)}
  )
  let cookieObj: Map<string, string> = new Map()
  cookies.forEach(cookie => {
    if (['token'].includes(cookie.name)) {
      cookieObj.set(cookie.name, cookie.value)
    }
  })
  return cookieObj
}

// 定时检查用户是否登录（host/id/token是否都在）
export const userCookieCheck$ = combineLatest(env$, timer(1000 * 10, 1000 * 60 * 60)) // 启动后的十秒，以及之后的每小时检测一次
.pipe(
  switchMap(async ([env, ]) => {
    const _isLogin = await isLogin(env!)
    return _isLogin.size === 1
  }),
)

function isUser (user: {}): user is TipUser {
  return 'tenantAlias' in user
}

export const clearUserCookie = () => {
  return new Promise((resolve, reject) => {
    const envSubscribe = env$.subscribe(async (env) => {
      try {
        const domain = env!
        
        await Promise.all([
          browser.cookies.remove({
            url: `https://${domain}/`,
            name: 'token'
          })
        ])
        const query = await browser.tabs.query({
          url: `https://${domain}/*`
        })
        query.map(tab => {
          browser.tabs.reload(tab.id)
        })
        envSubscribe.unsubscribe()
        resolve(true)
      } catch (err) {
        reject(err)
      }
    })
  })
}

export const getDeafultUserStream = (defaultUser: TipUser) => {
  return env$.pipe(
    switchMap(async _ => defaultUser)
  )
}