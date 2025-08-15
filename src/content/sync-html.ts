import { delay } from '../utils';
import browser from 'webextension-polyfill';
import { v4 as uuid } from 'uuid';
import { IViewResumeMessage } from '../models/stream';
import { processHTML } from '../utils/syncReceiveResumeUtil';

browser.runtime.onMessage.addListener((message: any) => {
  if (message.type === 'URL_CHANGED' && message.url === location.href) {
    console.log('收到 URL 变化消息:', message.url);
    // 检查当前 URL 是否符合条件
    if (shouldProcessThisUrl(location.href)) {
      console.log('URL 符合处理条件，重新运行');
      run();
    } else {
      console.log('URL 不符合处理条件，跳过处理');
    }
  }
  return true;
});

// 判断 URL 是否应该被处理
function shouldProcessThisUrl(url: string): boolean {
  const patterns = [/linkedin\.com\/in\//];
  return patterns.some(pattern => pattern.test(url));
}

console.log('sync-html: done');
async function run() {
  if (location.href.includes('linkedin.com/in')) {
    await delay(5000);
    console.log('抓取 LinkedIn 简历');
  } else {
    await delay(2000); // 抓取的时候页面可能没有完全加载完，所以等待一段时间再抓取
    console.log('抓取其他简历');
  }
  const html = await processHTML();
  const msg: IViewResumeMessage = {
    requestId: uuid(),
    type: 'sync-html',
    payload: {
      html,
      url: location.href,
      origin: location.origin,
    },
  };
  await browser.runtime.sendMessage(msg);
}

run();
