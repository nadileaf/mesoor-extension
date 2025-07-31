import { TipUser } from '../interfaces/storage';

/**
 * 解析JWT令牌，提取用户信息
 * @param token JWT令牌字符串
 * @returns 解析后的用户信息
 */
export const parseJwt = (token: string): TipUser => {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c: string) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return JSON.parse(jsonPayload);
}

/**
 * 根据URL获取对应的域名
 * @param url 原始URL
 * @returns 处理后的域名，带前导点
 */
export const getDomain = (url: string): string => {
  if (url.includes('ad5a3dd2b106a43c9b2770bfcee3ba0e-1a15dada60d7f3f7.elb.cn-northwest-1.amazonaws.com.cn')) {
    return '.ad5a3dd2b106a43c9b2770bfcee3ba0e-1a15dada60d7f3f7.elb.cn-northwest-1.amazonaws.com.cn'
  }
  if (url.includes('chajian.ciiicsh.com')) {
    return '.chajian.ciicsh.com'
  }
  if (url.includes('tip-test.ciicsh.com')) {
    return '.tip-test.ciicsh.com'
  }
  const urlSplited: string[] = url.split('.')
  urlSplited.reverse()
  const domainArray: string[] = urlSplited.slice(0, 2)
  domainArray.reverse()
  return `.${domainArray.join('.')}`
}
