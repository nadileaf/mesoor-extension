import React, { useEffect, useRef } from 'react';

// 引入browser polyfill
declare global {
  interface Window {
    browser: any;
  }
}

// 确保browser API可用
// if (typeof window !== "undefined" && !window.browser) {
//   try {
//     // 尝试导入browser polyfill
//     const script = document.createElement("script");
//     script.src = "/browser-polyfill.js";
//     script.type = "module";
//     document.head.appendChild(script);
//   } catch (error) {
//     console.warn("Browser polyfill not available:", error);
//   }

// 等待browser API可用或使用chrome作为回退
function ensureBrowserAPI(): Promise<any> {
  return new Promise(resolve => {
    // 如果已经可用，直接返回
    if (window.browser) {
      resolve(window.browser);
      return;
    }

    // 等待browser polyfill加载完成
    let attempts = 0;
    const maxAttempts = 10;
    const checkInterval = setInterval(() => {
      attempts++;
      if (window.browser) {
        clearInterval(checkInterval);
        resolve(window.browser);
      } else if (attempts >= maxAttempts) {
        // 超时后使用chrome作为回退
        clearInterval(checkInterval);
        console.warn(
          'Browser polyfill not available, using chrome as fallback'
        );
        window.browser = (window as any).chrome;
        resolve(window.browser);
      }
    }, 100);
  });
}

// 复用现有的iframe创建逻辑
async function compressAndEncodeBase64(input: string) {
  const uint8Array = new TextEncoder().encode(input);
  const compressedStream = new Response(
    new Blob([uint8Array]).stream().pipeThrough(new CompressionStream('gzip'))
  ).arrayBuffer();
  const compressedUint8Array = new Uint8Array(await compressedStream);
  return btoa(String.fromCharCode(...compressedUint8Array));
}

async function _getCompressedInputs(input: Record<string, string>) {
  const inputs = input || {};
  const compressedInputs: Record<string, string> = {};
  await Promise.all(
    Object.entries(inputs).map(async ([key, value]) => {
      compressedInputs[key] = await compressAndEncodeBase64(value);
    })
  );
  return compressedInputs;
}

async function _getCompressedSystemVariables(input: Record<string, any>) {
  const systemVariables = input?.systemVariables || {};
  const compressedSystemVariables: Record<string, string> = {};
  await Promise.all(
    Object.entries(systemVariables).map(async ([key, value]) => {
      compressedSystemVariables[`sys.${key}`] = await compressAndEncodeBase64(
        JSON.stringify(value)
      );
    })
  );
  return compressedSystemVariables;
}

async function createIframe(input: Record<string, any>) {
  // 临时禁用压缩，直接使用原始数据
  // const params = new URLSearchParams({
  //   ...(await _getCompressedInputs(input)),
  //   ...(await _getCompressedSystemVariables(input)),
  // });

  // 使用未压缩的数据
  const params = new URLSearchParams({
    ...input, // 直接使用原始input数据
  });

  const iframeUrl = `https://agent.mesoor.com/chat/uo6f9m16c0ymkBTR?${params}`;

  if (iframeUrl.length > 2048) {
    console.error('URL过长，请减少输入数量以防止机器人加载失败');
  }

  const iframe = document.createElement('iframe');
  iframe.allow = 'fullscreen;microphone';
  iframe.title = 'mesoor chatbot window';
  iframe.src = iframeUrl;
  iframe.style.cssText = `border:none;width:100%;height:100%;overflow:hidden;user-select:none;`;

  return iframe;
}

// 从JWT token中解析payload
function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to parse JWT token:', e);
    return null;
  }
}

const ChatContainer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeChat = async () => {
      if (!containerRef.current) return;

      try {
        // 从tip.mesoor.com获取token

        // const token = await (window as any).browser?.cookies?.get({
        const browserAPI = await ensureBrowserAPI();
        const token = await browserAPI?.cookies?.get({
          url: 'https://tip.mesoor.com',
          name: 'token',
        });

        const _token =
          token?.value ||
          import.meta.env.VITE_LOCAL_TOKEN ||
          'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VybmFtZTrliJjmlY_lqZUiLCJ0ZW5hbnRNZW1iZXIiOiJzaGFuZ2hhaWRlemh1cWl5ZWd1YW5saS0xODhUNTAxMTNiZjYtYjA5YS00M2Y2LWJiZmUtMGRmYjg3ZTNkOTI4IiwidGVuYW50SWQiOjE4OCwiaXNzIjoiZGVmYXVsdCIsInRlbmFudEFsaWFzIjoic2hhbmdoYWlkZXpodXFpeWVndWFubGktMTg4IiwiZXhwIjoxNzYxMTAzMTQyMDg0LCJ1c2VySWQiOiI1MDExM2JmNi1iMDlhLTQzZjYtYmJmZS0wZGZiODdlM2Q5MjgiLCJwcm9qZWN0SWQiOiJkZWZhdWx0IiwiaWF0IjoxNzUzMzI3MTQyMDg0fQ.EFHYDoBFJpwbw8pdMCB-TaZRRCbGFAiW8Qnyl0BPtQs';
        console.log('token', _token);

        if (!_token) {
          console.error('No token found plz login tip');
          containerRef.current.innerHTML = `
            <div class="flex items-center justify-center h-full">
              <div class="text-center">
                <div class="text-gray-500 mb-2">⚠️</div>
                <div class="text-gray-600">请先登录 tip.mesoor.com</div>
              </div>
            </div>
          `;
          return;
        }

        const payload = parseJwt(_token);
        if (!payload || !payload.userId) {
          console.error('Invalid token: no user_id found', payload);
          containerRef.current.innerHTML = `
            <div class="flex items-center justify-center h-full">
              <div class="text-center">
                <div class="text-gray-500 mb-2">❌</div>
                <div class="text-gray-600">Token无效，请重新登录</div>
              </div>
            </div>
          `;
          return;
        }

        console.log(payload);
        const iframe = await createIframe({
          'sys.user_id': payload.userId,
          user_id: payload.userId,
          token: _token,
          tenantId: payload.tenantAlias,
        });

        // 清空容器并添加iframe
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(iframe);
      } catch (error) {
        console.error('Failed to initialize chat:', error);
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div class="flex items-center justify-center h-full">
              <div class="text-center">
                <div class="text-gray-500 mb-2">❌</div>
                <div class="text-gray-600">初始化失败，请刷新重试</div>
              </div>
            </div>
          `;
        }
      }
    };

    initializeChat();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full bg-white">
      {/* 加载状态 */}
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <div className="text-gray-600">正在加载...</div>
        </div>
      </div>
    </div>
  );
};

export default ChatContainer;
