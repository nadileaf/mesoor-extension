/**
 * 脉脉 ECDSA Token 生成模块
 *
 * 生成脉脉 API 的 x-ent-rid / x-ent-fp / x-ent-token 三个认证 header。
 * 密钥对从页面内存劫持获取，**签名也委托给页面执行**（私钥不可导出）。
 * kid 通过 chrome.storage.session 持久化。
 */

const TOKEN_TTL = 1800000; // 30 分钟
const FP_VERSION = 'mm-entoken-v1';

// ====== 工具函数 ======

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

/** djb2 fallback 指纹: 4 轮 djb2 → 前 32 位 hex */
function djb2Fingerprint(input: string): string {
  let hash = djb2(input);
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += (hash >>> 0).toString(16);
    hash = djb2(hash.toString());
  }
  return result.slice(0, 32);
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** base64url 解码 (兼容 SW 环境, 无 atob 则用 Uint8Array) */
function base64UrlDecode(b64u: string): string {
  let b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  if (typeof atob !== 'undefined') return atob(b64);
  // Service Worker 环境可能没有 atob，用 Uint8Array 替代
  const binaryStr = typeof atob !== 'undefined' ? atob(b64) : '';
  if (binaryStr) return binaryStr;
  // 最终兜底
  const raw = Uint8Array.from(b64, c => c.charCodeAt(0));
  return new TextDecoder().decode(raw);
}

/** 解析脉脉 token (2-part: payload.sig 或 3-part: header.payload.sig), 不验签 */
export function parseMaimaiToken(token: string): { fp: string; kid: string } | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    // 2-part: payload.sig  (第一个是 payload)
    // 3-part: header.payload.sig (第二个是 payload)
    const payloadB64 = parts.length === 3 ? parts[1] : parts[0];
    const json = JSON.parse(base64UrlDecode(payloadB64));
    if (json.fp && json.kid) {
      return { fp: json.fp as string, kid: json.kid as string };
    }
    return null;
  } catch { return null; }
}

async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ====== 指纹计算 ======

interface FingerprintParts {
  ua: string;
  screen: string;
  colorDepth: string;
  timezone: string;
  cores: string;
  memory: string;
  touch: string;
  canvasHash: string;
  webglHash: string;
}

/** 从完整 parts 构造指纹原始字符串 */
function buildFingerprintRaw(parts: FingerprintParts): string {
  return [
    FP_VERSION,
    parts.ua,
    parts.screen,
    parts.colorDepth,
    parts.timezone,
    parts.cores,
    parts.memory,
    parts.touch,
    parts.canvasHash,
    parts.webglHash,
  ].join('|');
}

/** 计算 SHA-256 指纹 (content script 提供的完整数据) */
export async function computeFingerprint(parts: FingerprintParts): Promise<string> {
  const raw = buildFingerprintRaw(parts);
  const full = await sha256Hex(raw);
  return full.slice(0, 32);
}

/** SW 环境下的简化指纹 (无 canvas/webgl) */
function buildBasicFingerprintRaw(): string {
  return [
    FP_VERSION,
    navigator.userAgent || '',
    '', // screen - not available in SW
    '', // colorDepth - not available in SW
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    (navigator.hardwareConcurrency || 0).toString(),
    ((navigator as any).deviceMemory || 0).toString(),
    (navigator.maxTouchPoints || 0).toString(),
    '', // canvas hash
    '', // webgl hash
  ].join('|');
}

// ====== Token Manager ======

interface StoredKeyInfo {
  kid: string;
}

export class MaimaiTokenManager {
  private kid: string | null = null;
  private fingerprint: string | null = null;
  private mainScriptHash: string = '';
  /** 从页面原始 x-ent-token 解析出的 fp（优先使用，和油猴一致） */
  private pageFingerprint: string | null = null;
  /** 从页面原始 x-ent-token 解析出的 kid（优先使用，和油猴一致） */
  private pageKid: string | null = null;

  /** 设置页面 x-ent-token 中提取的 fp/kid */
  setPageTokenInfo(fp: string | null, kid: string | null): void {
    if (fp) { this.pageFingerprint = fp; console.log('[MaimaiToken] 从页面 token 获取 fp:', fp); }
    if (kid) {
      this.pageKid = kid;
      this.kid = kid;
      console.log('[MaimaiToken] 从页面 token 获取 kid:', kid);
      // 持久化到 session storage，防止 SW 重启丢失
      chrome.storage.session.set({ maimai_key_info: { kid } }).catch(() => {});
    }
  }

  constructor() {}

  /** 初始化: 从 storage 恢复 kid + 指纹 */
  async initialize(): Promise<void> {
    // 恢复指纹
    const stored = await chrome.storage.local.get('maimai_fingerprint');
    if (stored.maimai_fingerprint) {
      this.fingerprint = stored.maimai_fingerprint;
      console.log('[MaimaiToken] 从 storage 恢复指纹:', this.fingerprint);
    }

    // 恢复 kid
    const keyStore = await chrome.storage.session.get('maimai_key_info');
    if (keyStore.maimai_key_info) {
      const { kid } = keyStore.maimai_key_info as StoredKeyInfo;
      this.kid = kid;
      console.log('[MaimaiToken] 从 storage 恢复 kid:', kid);
    }
  }

  /** content script 发来的完整指纹 */
  async setFingerprint(fp: string): Promise<void> {
    this.fingerprint = fp;
    await chrome.storage.local.set({ maimai_fingerprint: fp });
    console.log('[MaimaiToken] 指纹已更新:', fp);
  }

  /** content script 发来的 main_script_hash */
  async setMainScriptHash(hash: string): Promise<void> {
    this.mainScriptHash = hash;
    console.log('[MaimaiToken] main_script_hash 已更新:', hash);
  }

  /** 获取当前指纹 (SW 环境 fallback - djb2) */
  private async getFingerprint(): Promise<string> {
    if (this.fingerprint) return this.fingerprint;

    // 用简化指纹 + djb2 fallback
    const raw = buildBasicFingerprintRaw();
    const fallback = djb2Fingerprint(raw);
    console.log('[MaimaiToken] 使用 fallback 指纹:', fallback);
    return fallback;
  }

  /** 从页面内存获取 kid（不存私钥，签名委托给页面） */
  async setKid(kid: string): Promise<void> {
    this.kid = kid;
    console.log('[MaimaiToken] kid 已设置:', kid);
    await chrome.storage.session.set({
      maimai_key_info: { kid }
    });
  }

  /** 检查是否已有可用的 kid */
  hasKid(): boolean {
    return this.kid !== null;
  }

  /** 确保已注册 (幂等) - 等待页面注入 kid，同时主动请求 tab 查询 */
  async ensureRegistered(tabId?: number): Promise<void> {
    if (this.kid) return;
    // 如果提供了 tabId，主动发消息让 content script 查询 kid
    if (tabId != null) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'maimai-request-kid' });
      } catch (_) { /* content script 可能尚未加载 */ }
    }
    // 等待页面注入 (最多等 20 秒，给 document_idle 足够时间)
    for (let i = 0; i < 200; i++) {
      if (this.kid) return;
      // 每 2 秒重试一次主动请求
      if (tabId != null && i > 0 && i % 20 === 0) {
        try {
          await chrome.tabs.sendMessage(tabId, { type: 'maimai-request-kid' });
        } catch (_) { /* content script 可能尚未加载 */ }
      }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('[MaimaiToken] 等待页面注入 kid 超时');
  }

  /** 强制重新注册 (页面刷新后重置) */
  async reRegister(): Promise<void> {
    this.kid = null;
    await chrome.storage.session.remove('maimai_key_info');
    await this.ensureRegistered();
  }

  /** 委托页面用捕获到的私钥签名数据 */
  private async signViaPage(data: string, tabId: number): Promise<string> {
    const requestId = crypto.randomUUID();
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error('[MaimaiToken] 签名超时'));
      }, 10000);

      const listener = (msg: any) => {
        if (msg.type === 'maimai-sign-response' && msg.requestId === requestId) {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(listener);
          if (msg.error) {
            reject(new Error(msg.error));
          } else {
            resolve(msg.signature);
          }
        }
      };
      chrome.runtime.onMessage.addListener(listener);

      chrome.tabs.sendMessage(tabId, {
      type: 'maimai-sign-data',
      requestId,
      data,
      }).catch((err) => {
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(listener);
      reject(err);
      });
    });
  }

  /** 生成一套完整的认证 headers（2部分 token: base64url(payload).base64url(sig)） */
  async getHeaders(tabId: number): Promise<{
    'x-ent-rid': string;
    'x-ent-fp': string;
    'x-ent-token': string;
  }> {
    await this.ensureRegistered(tabId);

    // 优先使用页面 token 中解析出的 fp/kid（和油猴一致），其次用 content script 计算的指纹
    const fp = this.pageFingerprint || await this.getFingerprint();
    const kid = this.kid; // kid 优先来自页面 token (setPageTokenInfo 已同步设置)
    const rid = crypto.randomUUID();
    const now = Date.now();

    // 构造 payload（无 JWT header，只有 payload）
    const payload = {
      v: 2,
      ts: now,
      exp: now + TOKEN_TTL,
      fp: fp,
      rid: rid,
      kid: this.kid,
    };

    // 2部分格式: base64url(JSON).base64url(sig)
    // 签名输入 = base64url(JSON.stringify(payload)) 的 UTF-8 字节
    const payloadJson = JSON.stringify(payload);
    const payloadB64 = base64UrlEncode(payloadJson);
    const signingInput = payloadB64; // 签 base64url 字符串的字节

    // 委托页面用私钥签名
    const sigRaw = await this.signViaPage(signingInput, tabId);
    const sigB64Url = sigRaw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const token = `${payloadB64}.${sigB64Url}`;

    console.log('[MaimaiToken] token payload:', payloadJson);

    return {
      'x-ent-rid': rid,
      'x-ent-fp': fp,
      'x-ent-token': token,
    };
  }
}

// 单例
export const maimaiTokenManager = new MaimaiTokenManager();
