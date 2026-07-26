import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DupeCheck } from './views/dupe-check';
import { ToastProvider } from './components/toast';
import { ToastListener } from './components/toast-listener';
import { CopyModalProvider } from './components/copy-modal';
import { CopyModalListener } from './components/copy-modal-listener';

import browser from 'webextension-polyfill';

console.log('[CRXJS] Hello world from content script!');

// 脉脉: 中转 MAIN world 消息到 SW (MAIN world hook 由 maimai-inject.ts 在 document_start 注入)
if (location.href.includes('maimai.cn')) {
  window.addEventListener('message', (event) => {
    // 在 ISOLATED world 中，event.source !== window 可能因 Chrome wrapper 而误判
    // 改用 type 过滤 + 同源检查
    if (!event.data?.type) return;
    if (event.data?.type === 'MAIMAI_KEY_CAPTURED') {
      kidReceived = true;
      browser.runtime.sendMessage({
        type: 'maimai-key-captured',
        kid: event.data.kid,
      }).catch(() => {});
    } else if (event.data?.type === 'MAIMAI_PAGE_TOKEN') {
      // MAIN world 从页面原始 fetch 中捕获到 fp/kid，回传给 SW
      browser.runtime.sendMessage({
        type: 'maimai-page-token',
        fp: event.data.fp,
        kid: event.data.kid,
      }).catch(() => {});
    } else if (event.data?.type === 'MAIMAI_PROXY_FETCH_RESPONSE') {
      browser.runtime.sendMessage({
        type: 'maimai-proxy-fetch-response',
        requestId: event.data.requestId,
        ok: event.data.ok,
        status: event.data.status,
        statusText: event.data.statusText,
        headers: event.data.headers,
        body: event.data.body,
        error: event.data.error,
      }).catch(() => {});
    } else if (event.data?.type === 'MAIMAI_SIGN_RESPONSE') {
      browser.runtime.sendMessage({
        type: 'maimai-sign-response',
        requestId: event.data.requestId,
        signature: event.data.signature,
        error: event.data.error,
      }).catch(() => {});
    }
  });

  // SW → page: proxy fetch + sign relay + proactive kid request
  browser.runtime.onMessage.addListener((msg: any) => {
    if (msg.type === 'maimai-proxy-fetch') {
      window.postMessage({ ...msg, type: 'MAIMAI_DO_FETCH' }, '*');
    } else if (msg.type === 'maimai-sign-data') {
      window.postMessage({ ...msg, type: 'MAIMAI_DO_SIGN' }, '*');
    } else if (msg.type === 'maimai-request-kid') {
      // SW 急需 kid，主动向 MAIN world 查询
      window.postMessage({ type: 'MAIMAI_REQUEST_KID' }, '*');
    }
  });

  // 主动向 MAIN world 查询 kid (MAIN world 在 document_start 已捕获，可能比我们早)
  let kidReceived = false;
  function requestKid(attempt: number) {
    if (attempt > 60 || kidReceived) return; // 最多重试 60 次 (约 12s)
    window.postMessage({ type: 'MAIMAI_REQUEST_KID' }, '*');
    setTimeout(() => requestKid(attempt + 1), 200);
  }
  requestKid(0);
}

// 脉脉: 计算浏览器指纹 (canvas + webgl) 并发送给 background
(async () => {
    try {
      const ua = navigator.userAgent || '';
      const screenInfo = `${window.screen.width}x${window.screen.height}`;
      const colorDepth = String(window.screen.colorDepth || '');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const cores = String(navigator.hardwareConcurrency || 0);
      const memory = String((navigator as any).deviceMemory || 0);
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
          const hashBuffer = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(dataUrl)
          );
          canvasHash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 32);
        }
      } catch (e) { /* ignore */ }

      // WebGL 指纹
      let webglHash = '';
      try {
        const gl = document.createElement('canvas').getContext('webgl');
        if (gl) {
          const dbgRenderInfo = gl.getExtension('WEBGL_debug_renderer_info');
          const vendor = dbgRenderInfo
            ? gl.getParameter(dbgRenderInfo.UNMASKED_VENDOR_WEBGL)
            : '';
          const renderer = dbgRenderInfo
            ? gl.getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL)
            : '';
          const raw = `${vendor}~${renderer}`;
          const hashBuffer = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(raw)
          );
          webglHash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 32);
        }
      } catch (e) { /* ignore */ }

      // 拼装原始指纹字符串
      const raw = [
        'mm-entoken-v1',
        ua,
        screenInfo,
        colorDepth,
        timezone,
        cores,
        memory,
        touch,
        canvasHash,
        webglHash,
      ].join('|');

      // SHA-256 → 前 32 位
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(raw)
      );
      const fingerprint = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32);

      console.log('[MaimaiFP] 指纹计算完成:', fingerprint);

      // 提取 main_script_hash (bundle hash，如 d62e6)
      let mainScriptHash = '';
      try {
        const scripts = document.querySelectorAll('script[src]');
        for (const s of scripts) {
          const match = /([0-9a-z]+)\.bundles\.js/.exec(s.getAttribute('src') || '');
          if (match) {
            mainScriptHash = match[1];
            break;
          }
        }
      } catch (e) { /* ignore */ }
      console.log('[MaimaiFP] main_script_hash:', mainScriptHash);

      // 发送给 background
      browser.runtime.sendMessage({
        type: 'maimai-fingerprint',
        fingerprint,
        mainScriptHash,
      }).catch(() => {
        // 重试一次
        setTimeout(() => {
          browser.runtime.sendMessage({
            type: 'maimai-fingerprint',
            fingerprint,
            mainScriptHash,
          }).catch(() => {});
        }, 2000);
      });
    } catch (e) {
      console.warn('[MaimaiFP] 指纹计算失败:', e);
    }
  })();

const container = document.createElement('div');
container.id = 'crxjs-app';
document.body.appendChild(container);
createRoot(container).render(
  <StrictMode>
    <DupeCheck />
    <ToastProvider>
      <ToastListener />
    </ToastProvider>
    <CopyModalProvider>
      <CopyModalListener />
    </CopyModalProvider>
  </StrictMode>
);
