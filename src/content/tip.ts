// content.js
console.log('TIP内容脚本已注入');

const source = 'MesoorExtension';
window.postMessage(source);

// 监听来自网页的消息
window.addEventListener('message', event => {
  const { data } = event;

  // 仅接受来自本页面的消息，并检查消息类型以确保安全
  if (event.source !== window || !data || data.source !== 'tip') {
    return;
  }

  if (data.type === 'ping') {
    window.postMessage({ source, action: 'pong' }, '*');
    return;
  }

  if (['submitResume', 'publishJob'].includes(data.type)) {
    // 网页请求调用插件功能，将消息转发给插件后台
    chrome.runtime.sendMessage({ ...data }, response => {
      console.log('mesoor extension response', response);
      if (chrome.runtime.lastError) {
        window.postMessage(
          {
            source,
            action: data.type,
            status: 'failed',
            message: chrome.runtime.lastError.message,
          },
          '*'
        );
        return;
      }

      // 收到后台的回复，再转发给网页
      window.postMessage(
        {
          source,
          action: data.type,
          response,
        },
        '*'
      );
    });
  }
});

// 监听来自插件后台的消息（如果后台需要主动向网页发送消息的话）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('mesoor extension onMessage', request);
  if (request.action === 'someOtherAction') {
    // 假设插件后台发来了一条消息，转发给网页
    window.postMessage(
      {
        source: 'plugin-response',
        action: 'someOtherAction',
        payload: request.payload,
      },
      '*'
    );
  }
  // 注意：这里没有 sendResponse()，因为是单向通信
});
