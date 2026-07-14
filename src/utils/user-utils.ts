import { TipUser } from '../interfaces/storage';

/**
 * 解析JWT令牌，提取用户信息
 * @param token JWT令牌字符串
 * @returns 解析后的用户信息
 */
export const parseJwt = (token: string): TipUser => {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map(function (c: string) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join('')
  );
  return JSON.parse(jsonPayload);
};

/**
 * 根据URL获取对应的域名
 * @param url 原始URL（可以包含协议，如 https://rencaigeili.com）
 * @returns 处理后的域名，带前导点（如 .rencaigeili.com）
 */
export const getDomain = (url: string): string => {
  // 移除协议部分（http:// 或 https://）
  let domain = url.replace(/^https?:\/\//, '');
  // 移除路径部分（如果有）
  domain = domain.split('/')[0];
  // 移除端口号（如果有）
  domain = domain.split(':')[0];

  const urlSplited: string[] = domain.split('.');
  urlSplited.reverse();
  const domainArray: string[] = urlSplited.slice(0, 2);
  domainArray.reverse();
  return `.${domainArray.join('.')}`;
};

interface CookieSetDetails {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'no_restriction';
  expirationDate?: number;
}

interface CookieRemoveDetails {
  url: string;
  name: string;
}

interface BrowserCookieAPI {
  cookies: {
    set(details: CookieSetDetails): Promise<unknown>;
    remove(details: CookieRemoveDetails): Promise<unknown>;
  };
}

const TOKEN_COOKIE_NAME = 'token';

export async function writeTokenCookie(
  token: string,
  browserLike: BrowserCookieAPI,
  cookieDomain: string,
  tokenHost?: string
): Promise<void> {
  if (!browserLike?.cookies?.set) {
    console.warn('[writeTokenCookie] cookies API 不可用，跳过写入');
    return;
  }

  const host = tokenHost || import.meta.env.VITE_TOKEN_HOST;
  const { exp } = parseJwt(token);

  try {
    await browserLike.cookies.set({
      url: host + '/',
      name: TOKEN_COOKIE_NAME,
      value: token,
      domain: cookieDomain,
      path: '/',
      secure: true,
      sameSite: 'lax',
      expirationDate: exp,
    });
  } catch (error) {
    console.error('[writeTokenCookie] 写入失败:', error);
  }
}

export async function removeTokenCookie(
  browserLike: BrowserCookieAPI,
  tokenHost?: string
): Promise<void> {
  if (!browserLike?.cookies?.remove) {
    console.warn('[removeTokenCookie] cookies API 不可用，跳过移除');
    return;
  }

  const host = tokenHost || import.meta.env.VITE_TOKEN_HOST;

  try {
    await browserLike.cookies.remove({
      url: host + '/',
      name: TOKEN_COOKIE_NAME,
    });
  } catch (error) {
    console.error('[removeTokenCookie] 移除失败:', error);
  }
}
