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
