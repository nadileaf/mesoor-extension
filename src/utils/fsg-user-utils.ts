import { v5 as uuidv5 } from 'uuid';
import { FSGUser } from '../interfaces/storage';
import { parseJwt } from './user-utils';
import { request } from './request';

export interface CreateUserParams {
  id: string;
  phone: string;
  username: string;
  tenantAlias: string;
  email?: string;
}

export interface CreateUserResponse {
  token: string;
}

/**
 * 手机号格式化（补充+86前缀）
 */
export function formatPhoneNumber(phone: string): string {
  const cleanedPhone = phone.replace(/\D/g, '');
  if (cleanedPhone.startsWith('86')) {
    return cleanedPhone;
  }
  return `86${cleanedPhone}`;
}

/**
 * UUID生成（fromString）
 */
export function generateIdFromString(phone: string): string {
  const cleanedPhone = formatPhoneNumber(phone);
  const namespace = uuidv5('fsg-user', uuidv5.DNS);
  return uuidv5(cleanedPhone, namespace);
}

/**
 * 调用用户创建接口
 */
export async function createUserWithToken(
  params: CreateUserParams,
  apiBase: string
): Promise<string> {
  const url = `${apiBase}/users/generate/withToken`;
  console.log('请求URL:', url);
  console.log('请求参数:', params);

  try {
    const response = await request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    console.log('响应状态:', response.status);
    const data = (await response.json()) as CreateUserResponse;
    console.log('响应数据:', data);
    return data.token;
  } catch (error) {
    console.error('API调用失败:', error);
    if (error instanceof Error && 'response' in error) {
      console.error('错误详情:', (error as any).response);
    }
    throw error;
  }
}

/**
 * 解析返回的JWT token并构造FSGUser对象
 */
export function parseFSGToken(
  token: string,
  phone: string,
  username: string,
  tenantAlias: string,
  email?: string
): FSGUser {
  const jwtPayload = parseJwt(token);
  return {
    id: jwtPayload.userId || generateIdFromString(phone),
    phone,
    username,
    tenantAlias,
    email,
    token,
    createdAt: Date.now(),
  };
}

/**
 * 检查token是否过期
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = parseJwt(token);
    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
  } catch (error) {
    console.error('Failed to check token expiration:', error);
    return true;
  }
}
