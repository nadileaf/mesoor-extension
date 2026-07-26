// ==UserScript==
// @name         Maimai Token Computer
// @namespace    http://tampermonkey.net/
// @version      1.10
// @description  重放对比模式：签名输入=base64url(payload)字符串字节（和页面一致）
// @author       You
// @match        *://maimai.cn/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  let capturedKeyPair = null;
  let capturedKid = null;
  let capturedExpire = null;
  let capturedServerTime = null;
  let computedFingerprint = null;
  let registerPubkeyBody = null;

  // 需要自动注入 header 的 API 路径
  const INTERCEPT_PATTERNS = [
    'anti_automation/talent/basic',
    'api/ent/talent/basic',
    'jobs/jobs_resume',
  ];

  function shouldIntercept(url) {
    return INTERCEPT_PATTERNS.some(p => url.includes(p));
  }

  // ========== Hook crypto.subtle.sign 捕获签名用的私钥 ==========
  const origSign = crypto.subtle.sign.bind(crypto.subtle);
  crypto.subtle.sign = async function (algorithm, key, data) {
    if (algorithm.name === 'ECDSA' && algorithm.hash === 'SHA-256' && key.type === 'private') {
      console.log('[油猴] 🔏 sign 调用, 私钥:', key);
      capturedKeyPair = { ...capturedKeyPair, privateKey: key };
    }
    const result = await origSign(algorithm, key, data);
    return result;
  };
  console.log('[油猴] sign hook 已安装');

  // ========== Hook crypto.subtle.generateKey 捕获 ECDSA 密钥对 ==========
  const origGenerateKey = crypto.subtle.generateKey.bind(crypto.subtle);
  crypto.subtle.generateKey = async function (algorithm, extractable, keyUsages) {
    const keyPair = await origGenerateKey(algorithm, extractable, keyUsages);
    if (algorithm.name === 'ECDSA' && algorithm.namedCurve === 'P-256') {
      // sign hook 会覆盖 privateKey, 这里主要拿 publicKey
      capturedKeyPair = keyPair;
      console.log('[油猴] 🔑 generateKey 捕获 ECDSA P-256 密钥对');
    }
    return keyPair;
  };
  console.log('[油猴] generateKey hook 已安装');

  // ========== Hook fetch (自动注入 + 数据捕获) ==========
  const origFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const request = args[0] instanceof Request ? args[0] : { url: String(args[0] || '') };
    const url = request.url || String(args[0] || '');
    let options = args[1] ? Object.assign({}, args[1]) : {};

    // 捕获 register_pubkey 请求体
    if (url.includes('register_pubkey') && options.body) {
      try {
        registerPubkeyBody = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        console.log('[油猴] register_pubkey 请求体:', registerPubkeyBody);
      } catch (e) {}
    }

    // 在发请求前先保存请求信息（原始 fetch 会消费 Request body）
    let replayInfo = null;
    if (shouldIntercept(url) && capturedKeyPair && capturedKid) {
      try {
        const method = args[0] instanceof Request ? args[0].method : (options.method || 'GET');
        const body = args[0] instanceof Request
          ? (method === 'GET' || method === 'HEAD' ? undefined : await args[0].clone().text())
          : (options.body || undefined);
        let originalHeaders = {};
        if (args[0] instanceof Request) {
          originalHeaders = headersToPlain(args[0].headers);
        } else if (options.headers) {
          originalHeaders = headersToPlain(options.headers);
        }
        console.log('[油猴] 📋 originalHeaders keys:', Object.keys(originalHeaders));
        console.log('[油猴] 📋 originalHeaders x-ent-token 前80字:', (originalHeaders['x-ent-token'] || originalHeaders['X-Ent-Token'] || '无').substring(0, 80));
        // 尝试多种 key 名
        const pageToken = originalHeaders['x-ent-token'] || originalHeaders['X-Ent-Token'] ||
                          originalHeaders['x-ent-token'] || originalHeaders['X-ENT-TOKEN'] || '';
        const pageJWT = parseJWTPayload(pageToken);
        const pageFingerprint = pageJWT ? pageJWT.fp : null;
        const pageKid = pageJWT ? pageJWT.kid : null;
        console.log('[油猴] 📋 解析页面JWT:', pageJWT ? '✅' : '❌失败', 'fp:', pageFingerprint, 'kid:', pageKid);
        replayInfo = { url, method, body, originalHeaders, pageFingerprint, pageKid };
      } catch (e) {
        console.warn('[油猴] 保存请求信息失败:', e.message);
      }
    }

    const response = await origFetch(...args);

    // 页面请求发完后，用我们的 header 再发一份做对比
    if (replayInfo && capturedKeyPair && capturedKid) {
      try {
        // 用页面指纹+页面kid（不是自己捕获的）来签名
        const headers = await computeTokenHeaders(replayInfo.pageFingerprint, replayInfo.pageKid);

        // 合并原始 headers + 计算的新 header（不覆盖 csrf-token 等）
        const mergedHeaders = Object.assign({}, replayInfo.originalHeaders, headers);

        const replayOptions = {
          method: replayInfo.method,
          headers: mergedHeaders,
          body: replayInfo.body,
        };

        console.log('%c[油猴] 📤 页面原始请求已发送，', 'color: gray', replayInfo.url.substring(0, 80));
        console.log('%c[油猴] 🔄 正在用页面指纹重放对比...', 'color: orange; font-weight: bold');
        console.log('  页面 x-ent-fp:', replayInfo.pageFingerprint);
        console.log('  原始 x-csrf-token:', replayInfo.originalHeaders['x-csrf-token'] || '无');
        console.log('  替换 headers:', JSON.stringify(headers, null, 2));

        const replayResponse = await origFetch(replayInfo.url, replayOptions);
        const replayClone = replayResponse.clone();
        const replayText = await replayClone.text();

        console.log('%c[油猴] 📥 对比结果:', 'color: cyan; font-weight: bold');
        console.log('  页面请求状态:', response.status);
        console.log('  计算请求状态:', replayResponse.status);
        if (replayResponse.status === 204) {
          const csrfFromResp = replayResponse.headers.get('X-CSRF-Token') || replayResponse.headers.get('x-csrf-token');
          console.log('  ⚠️ 204 响应, X-CSRF-Token:', csrfFromResp);
        }
        console.log('  计算请求 body (前500字):', replayText.substring(0, 500));
      } catch (e) {
        console.warn('[油猴] 重放对比失败:', e.message);
      }
    }

    // 捕获 register_pubkey 响应
    try {
      if (url.includes('register_pubkey')) {
        const clone = response.clone();
        const text = await clone.text();
        console.log('[油猴] register_pubkey 响应:', text);
        if (text) {
          const data = JSON.parse(text);
          if (data.kid) {
            capturedKid = data.kid;
            capturedExpire = data.expire;
            capturedServerTime = data.server_time;
            console.log('%c[油猴] ✅ kid:', 'color: green', data.kid,
              'expire:', new Date(data.expire).toLocaleString());
          }
        }
      }
    } catch (e) {
      console.warn('[油猴] 解析响应失败:', e.message);
    }
    return response;
  };
  console.log('[油猴] fetch hook 已安装 (自动注入模式)');

  // ========== 指纹计算 ==========
  async function computeFingerprint() {
    const ua = navigator.userAgent || '';
    const screenInfo = `${window.screen.width}x${window.screen.height}`;
    const colorDepth = String(window.screen.colorDepth || '');
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const cores = String(navigator.hardwareConcurrency || 0);
    const memory = String(navigator.deviceMemory || 0);
    const touch = String(navigator.maxTouchPoints || 0);

    // Canvas 指纹
    let canvasHash = '';
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 280;
      canvas.height = 60;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 100, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('mm-entoken-v1 🤖', 2, 18);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('mm-entoken-v1 🤖', 4, 35);
        const dataUrl = canvas.toDataURL();
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl));
        canvasHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
          .slice(0, 32);
      }
    } catch (e) {}

    // WebGL 指纹
    let webglHash = '';
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (gl) {
        const dbgRenderInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = dbgRenderInfo ? gl.getParameter(dbgRenderInfo.UNMASKED_VENDOR_WEBGL) : '';
        const renderer = dbgRenderInfo ? gl.getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL) : '';
        const raw = `${vendor}~${renderer}`;
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
        webglHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
          .slice(0, 32);
      }
    } catch (e) {}

    // 拼装原始指纹字符串
    const raw = [
      'mm-entoken-v1', ua, screenInfo, colorDepth, timezone,
      cores, memory, touch, canvasHash, webglHash,
    ].join('|');
    console.log('[油猴] 指纹原始:', raw);

    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const fingerprint = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);

    console.log('[油猴] ✅ 指纹:', fingerprint, '(canvas:', canvasHash, 'webgl:', webglHash, ')');
    return fingerprint;
  }

  // ========== 工具函数 ==========
  function base64UrlEncode(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function uint8ToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  /** 解析 JWT payload (不验签) */
  function parseJWTPayload(token) {
    try {
      if (!token || typeof token !== 'string') return null;
      const parts = token.split('.');
      // 标准JWT: header.payload.signature, 也有 headerless: payload.signature
      if (parts.length === 3) {
        let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (payload.length % 4) payload += '=';
        return JSON.parse(atob(payload));
      }
      if (parts.length === 2) {
        let payload = parts[0].replace(/-/g, '+').replace(/_/g, '/');
        while (payload.length % 4) payload += '=';
        return JSON.parse(atob(payload));
      }
      console.warn('[油猴] JWT 分段数不对:', parts.length, '(期望2或3)');
      return null;
    } catch (e) {
      console.warn('[油猴] parseJWTPayload 异常:', e.message, 'token长度:', token?.length);
      return null;
    }
  }

  /** 从 Headers 对象正确提取所有 key-value */
  function headersToPlain(headersObj) {
    const result = {};
    if (!headersObj) return result;
    if (headersObj instanceof Headers) {
      headersObj.forEach((v, k) => { result[k] = v; });
    } else if (typeof headersObj === 'object') {
      Object.assign(result, headersObj);
    }
    return result;
  }

  // ========== Token 计算 (2部分格式, 签 base64url(payload) 字符串字节) ==========
  async function computeTokenHeaders(pageFingerprint, pageKid) {
    if (!capturedKeyPair) throw new Error('未捕获密钥对');
    const fp = pageFingerprint || computedFingerprint || await computeFingerprint();
    const kid = pageKid || capturedKid;
    if (!kid) throw new Error('未获取 kid');

    const rid = crypto.randomUUID();
    const now = Date.now();
    const payload = { v: 2, ts: now, exp: now + 5 * 60 * 1000, fp, rid, kid };

    // 页面格式: base64url(JSON).base64url(sig)
    // 签名输入 = base64url(JSON.stringify(payload)) 的 UTF-8 字节!
    // 流程: G=base64url → l=G(JSON_bytes) → sign(encode(l)) → d=G(sig) → token=l.d
    const payloadJson = JSON.stringify(payload);
    const payloadB64 = base64UrlEncode(payloadJson);
    const lBytes = new TextEncoder().encode(payloadB64);  // 签 base64url 字符串, 不是 JSON!

    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      capturedKeyPair.privateKey,
      lBytes
    );

    const token = payloadB64 + '.' + uint8ToBase64Url(new Uint8Array(sig));
    console.log('[油猴] token payload:', payloadJson);
    return { 'x-ent-rid': rid, 'x-ent-fp': fp, 'x-ent-token': token };
  }

  // ========== 公开 API ==========
  window.__maimaiStatus = function () {
    console.log('%c=== 油猴状态 ===', 'color: cyan; font-size: 14px');
    console.log('密钥对:', capturedKeyPair ? '✅ 已捕获' : '❌ 未捕获');
    if (capturedKeyPair) {
      console.log('  publicKey:', capturedKeyPair.publicKey);
      console.log('  privateKey:', capturedKeyPair.privateKey);
    }
    console.log('kid:', capturedKid || '❌ 未捕获');
    if (capturedExpire) console.log('expire:', capturedExpire, '(', new Date(capturedExpire).toLocaleString(), ')');
    if (capturedServerTime) console.log('server_time:', capturedServerTime);
    console.log('指纹:', computedFingerprint || '❌ 未计算');
    if (registerPubkeyBody) console.log('注册请求体:', registerPubkeyBody);
  };

  window.__maimaiComputeToken = async function () {
    try {
      if (!capturedKeyPair) { console.error('[油猴] ❌ 未捕获密钥对'); return null; }
      if (!capturedKid) { console.error('[油猴] ❌ 未捕获 kid'); return null; }

      console.log('%c=== 手动计算 Token ===', 'color: yellow; font-size: 14px');
      // 手动计算时用自己的指纹和捕获的 kid
      if (!computedFingerprint) computedFingerprint = await computeFingerprint();
      const headers = await computeTokenHeaders(computedFingerprint, capturedKid);

      console.log('%c✅ 结果 (自算指纹):', 'color: green; font-size: 16px');
      console.log('x-ent-rid:', headers['x-ent-rid']);
      console.log('x-ent-fp:', headers['x-ent-fp']);
      console.log('x-ent-token:', headers['x-ent-token']);
      console.log('%c复制:', 'color: orange', JSON.stringify(headers, null, 2));

      return headers;
    } catch (e) {
      console.error('[油猴] ❌ 计算失败:', e.message, e.stack);
      return null;
    }
  };

  // 页面加载后自动计算指纹
  document.addEventListener('DOMContentLoaded', async () => {
    try { computedFingerprint = await computeFingerprint(); } catch (e) {}
    console.log('[油猴] 就绪! 输入 __maimaiStatus() 查看状态, __maimaiComputeToken() 手动计算');
    console.log('[油猴] 自动拦截: ' + INTERCEPT_PATTERNS.join(', '));
  });
})();
