import { delay } from '../utils';
import browser from 'webextension-polyfill';
import { v4 as uuid } from 'uuid';
import { IViewResumeMessage } from '../models/stream';
import { processHTML } from '../utils/syncReceiveResumeUtil';

console.log('sync-html: done');
async function run() {
  await delay(2000); // 抓取的时候页面可能没有完全加载完，所以等待一段时间再抓取
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
