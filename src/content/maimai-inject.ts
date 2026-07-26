// 脉脉: document_start + world=MAIN, 在页面脚本之前直接执行
// 无需注入，本身就运行在 MAIN world

console.log('[MaimaiHook] MAIN world hook 开始安装 (document_start, world=MAIN)');

// ========== 反监控：禁用 voyager 上报（阻止 extension_watch 等所有埋点） ==========
// 暂时注释掉，方便调试
// const __voyagerStub: any = {
//   trackEvent() {},
//   callPageViewEvent() {},
//   refreshPageSessionId() {},
// };
// Object.defineProperty(window, 'voyager', {
//   get() { return __voyagerStub; },
//   set(_v: any) { /* 吃掉页面后续的赋值 */ },
//   configurable: true,
//   enumerable: true,
// });
// console.log('[MaimaiHook] window.voyager 已锁定为 stub（阻止 ent_v41_brower_extension_watch 等上报）');

const origGenerateKey = crypto.subtle.generateKey.bind(crypto.subtle);
const origSign = crypto.subtle.sign.bind(crypto.subtle);
let capturedKeyPair: CryptoKeyPair | null = null;
let capturedKid: string | null = null;

// ========== Hook crypto.subtle.sign: 捕获页面实际签名用的私钥 ==========
// 页面可能生成多个 ECDSA P-256 密钥对，sign hook 捕获真正用于签 API 请求的那个
crypto.subtle.sign = async (algorithm: any, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer> => {
  if (algorithm?.name === 'ECDSA' && algorithm?.hash === 'SHA-256' && key?.type === 'private') {
    if (capturedKeyPair) {
      capturedKeyPair = { ...capturedKeyPair, privateKey: key };
    }
    console.log('[MaimaiHook] 🔏 sign 调用, 已更新 privateKey');
  }
  return origSign(algorithm, key, data);
};
console.log('[MaimaiHook] sign hook 已安装');

crypto.subtle.generateKey = async (algorithm: any, extractable: boolean, keyUsages: any): Promise<any> => {
  const result = await origGenerateKey(algorithm, extractable, keyUsages);
  if (algorithm.name === 'ECDSA' && algorithm.namedCurve === 'P-256') {
    capturedKeyPair = result;
    console.log('[MaimaiHook] 截获 ECDSA P-256 密钥对');
  }
  return result;
};

const origFetch = window.fetch.bind(window);
window.fetch = async function(url: any, options: any) {
  // 在请求发送前，捕获页面原始的 x-ent-token 头中的 fp/kid
  captureTokenFromFetchHeaders(options?.headers);

  const res = await origFetch(url, options);
  if (typeof url === 'string' && url.includes('register_pubkey') && capturedKeyPair && !capturedKid) {
    try {
      const clone = res.clone();
      const text = await clone.text();
      console.log('[MaimaiHook] register_pubkey 响应体:', text.substring(0, 500));
      if (text) {
        const data = JSON.parse(text);
        if (data.kid) {
          capturedKid = data.kid;
          console.log('[MaimaiHook] 截获 kid:', data.kid);
        }
      }
    } catch(e) { console.warn('[MaimaiHook] 截获kid失败:', e); }
  }
  return res;
};

// 辅助: 从 fetch headers 中提取 fp/kid
function captureTokenFromFetchHeaders(headers: any): void {
  try {
    let token: string | null = null;
    if (headers) {
      if (headers instanceof Headers) {
        token = headers.get('x-ent-token');
      } else if (typeof headers === 'object') {
        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === 'x-ent-token') { token = v as string; break; }
        }
      }
    }
    postTokenInfo(token);
  } catch(_) { /* 忽略 header 读取错误 */ }
}

// 从 token 中解析 fp/kid 并发送
function postTokenInfo(token: string | null): void {
  if (!token) return;
  try {
    const parts = token.split('.');
    const payloadB64 = parts.length === 3 ? parts[1] : parts[0];
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64));
    if (json.fp && json.kid) {
      window.postMessage({
        type: 'MAIMAI_PAGE_TOKEN',
        fp: json.fp as string,
        kid: json.kid as string,
      }, '*');
    }
  } catch(_) { /* 解析失败忽略 */ }
}

// Hook XMLHttpRequest: 拦截 x-ent-token header（脉脉可能用 XHR/axios 而非 fetch）
const OrigXHR = window.XMLHttpRequest;
const origXHROpen = OrigXHR.prototype.open;
const origXHRSetHeader = OrigXHR.prototype.setRequestHeader;
const origXHRSend = OrigXHR.prototype.send;

OrigXHR.prototype.open = function(method: string, url: string | URL) {
  (this as any).__maimai_url = typeof url === 'string' ? url : url.toString();
  (this as any).__maimai_method = method;
  return origXHROpen.apply(this, arguments as any);
};

OrigXHR.prototype.setRequestHeader = function(name: string, value: string) {
  if (name.toLowerCase() === 'x-ent-token') {
    postTokenInfo(value);
  }
  return origXHRSetHeader.apply(this, arguments as any);
};

OrigXHR.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
  const self = this as any;
  self.addEventListener('readystatechange', () => {
    if (self.readyState === 4 && self.__maimai_url?.includes('register_pubkey') && capturedKeyPair && !capturedKid) {
      try {
        const text = self.responseText;
        if (text) {
          const data = JSON.parse(text);
          if (data.kid) {
            capturedKid = data.kid;
            console.log('[MaimaiHook] XHR 截获 kid:', data.kid);
          }
        }
      } catch(e) { /* ignore */ }
    }
  });
  return origXHRSend.apply(this, arguments as any);
};

console.log('[MaimaiHook] fetch + XHR hooks 已安装');

// Fetch proxy + Sign proxy + Kid 查询
window.addEventListener('message', async (event: any) => {
  if (!event.data?.type) return;

  // ISOLATED world 中继初始化后，主动来查询 kid
  if (event.data?.type === 'MAIMAI_REQUEST_KID') {
    if (capturedKid) {
      window.postMessage({ type: 'MAIMAI_KEY_CAPTURED', kid: capturedKid }, '*');
    }
    return;
  }

  if (event.data?.type === 'MAIMAI_DO_FETCH') {
    const { url, method, headers, body, requestId } = event.data;
    try {
      const init: any = { method: method || 'GET', headers: headers || {} };
      if (body && method !== 'GET' && method !== 'HEAD') {
        init.body = body;
      }
      const resp = await origFetch(url, init);
      const respText = await resp.text();
      const respHeaders: any = {};
      resp.headers.forEach((v: string, k: string) => { respHeaders[k] = v; });
      window.postMessage({
        type: 'MAIMAI_PROXY_FETCH_RESPONSE',
        requestId,
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
        headers: respHeaders,
        body: respText,
      }, '*');
    } catch (err: any) {
      window.postMessage({
        type: 'MAIMAI_PROXY_FETCH_RESPONSE',
        requestId,
        ok: false,
        error: err.message,
      }, '*');
    }
  }

  if (event.data?.type === 'MAIMAI_DO_SIGN') {
    const { data, requestId } = event.data;
    try {
      if (!capturedKeyPair) {
        throw new Error('密钥对尚未捕获');
      }
      const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        capturedKeyPair.privateKey,
        new TextEncoder().encode(data)
      );
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
      window.postMessage({
        type: 'MAIMAI_SIGN_RESPONSE',
        requestId,
        signature: sigB64,
      }, '*');
    } catch (err: any) {
      window.postMessage({
        type: 'MAIMAI_SIGN_RESPONSE',
        requestId,
        error: err.message,
      }, '*');
    }
  }
});
