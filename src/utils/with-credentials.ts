import browser, { WebRequest } from 'webextension-polyfill';
import { ApiConfig } from '../models/stream.ts';

export function install(
  urls: string[],
  founds: Map<string, { [name: string]: string }>
) {
  const extraInfoSpec = ['blocking', 'requestHeaders'];
  const IS_CHROME = /Chrome\/(\d+)\.(\d+)/.test(navigator.userAgent);
  if (
    IS_CHROME &&
    (browser.webRequest as any).OnBeforeSendHeadersOptions.hasOwnProperty(
      'EXTRA_HEADERS'
    )
  ) {
    extraInfoSpec.push('extraHeaders');
  }
  browser.webRequest.onBeforeSendHeaders.addListener(
    handler as any,
    { urls },
    extraInfoSpec as any
  );
  function handler(
    detail: WebRequest.OnBeforeSendHeadersDetailsType
  ): WebRequest.BlockingResponse {
    if (detail.tabId !== -1) {
      return { requestHeaders: detail.requestHeaders };
    } else {
      console.log('Origin Headers:', detail.requestHeaders);
      const headers = detail.requestHeaders;
      if (!headers) {
        return { requestHeaders: [] };
      }
      const originIndex = headers.findIndex(
        header => header.name.toLowerCase() === 'origin'
      );
      if (detail.method.toLowerCase() === 'post' && originIndex === -1) {
        headers.push({ name: 'origin', value: new URL(detail.url).origin });
      } else if (originIndex !== -1) {
        headers.splice(originIndex, 1);
      }
      const founded = founds.get(detail.url);
      if (!!founded) {
        for (const header of headers) {
          const foundedValue = founded[header.name.toLowerCase()];
          if (!!foundedValue) {
            header.value = founded[header.name];
            delete founded[header.name];
          }
        }
        for (const [name, value] of Object.entries(founded)) {
          headers.push({ name, value });
        }
        founds.delete(detail.url);
      }
      console.log('Midified Headers:', detail.requestHeaders);
      return {
        requestHeaders: headers,
      };
    }
  }
}

var declarativeNetRequestRules = [
  {
    id: 1,
    priority: 2,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        {
          header: 'origin',
          operation: 'set',
          value: 'https://rd6.zhaopin.com/',
        },
      ],
    },
    condition: {
      urlFilter: '||zhaopin.com',
      resourceTypes: ['xmlhttprequest'],
      tabIds: [-1],
    },
  },
  {
    id: 2,
    priority: 2,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'origin', operation: 'set', value: 'https://h.liepin.com' },
        { header: 'referer', operation: 'set', value: 'https://h.liepin.com' },
      ],
    },
    condition: {
      urlFilter: '*://api-h.liepin.com/*',
      resourceTypes: ['xmlhttprequest'],
      tabIds: [-1],
    },
  },
  {
    id: 3,
    priority: 2,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'referer', operation: 'set', value: 'https://my.58.com' },
      ],
    },
    condition: {
      urlFilter: 'my.58.com/*',
      resourceTypes: ['xmlhttprequest'],
      tabIds: [-1],
    },
  },
  {
    id: 4,
    priority: 2,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        {
          header: 'referer',
          operation: 'set',
          value: 'https://easy.lagou.com/im/chat/index.htm?',
        },
      ],
    },
    condition: {
      urlFilter: 'easy.lagou.com/search/*',
      resourceTypes: ['xmlhttprequest'],
      tabIds: [-1],
    },
  },
  {
    id: 5,
    priority: 2,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        {
          header: 'referer',
          operation: 'set',
          value: 'https://www.duolie.com/',
        },
        { header: 'origin', operation: 'set', value: 'https://www.duolie.com' },
      ],
    },
    condition: {
      urlFilter:
        'api-rcn.duolie.com/api/com.liepin.rcnresume.get-resume-detail',
      resourceTypes: ['xmlhttprequest'],
      tabIds: [-1],
    },
  },
  {
    id: 6,
    priority: 2,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        {
          header: 'origin',
          operation: 'set',
          value: 'https://lpt.liepin.com',
        },
      ],
    },
    condition: {
      urlFilter: '*api-lpt.liepin.com*',
      resourceTypes: ['xmlhttprequest'],
      tabIds: [-1],
    },
  },
  {
    id: 7,
    priority: 2,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        {
          header: 'origin',
          operation: 'set',
          value: 'https://www.yupaowang.com',
        },
      ],
    },
    condition: {
      urlFilter: 'https://yupao-prod.yupaowang.com',
      resourceTypes: ['xmlhttprequest'],
      tabIds: [-1],
    },
  },
];
export async function installDeclarativeNet(api: ApiConfig) {
  const rules = declarativeNetRequestRules;
  console.log('成功获取请求拦截信息: ', rules);
  await (browser as any).declarativeNetRequest.updateSessionRules({
    removeRuleIds: (rules as any[]).map(r => r.id),
    addRules: rules,
  });
}
