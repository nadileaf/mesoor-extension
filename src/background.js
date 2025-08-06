import { jsPDF } from 'jspdf';
import { BehaviorSubject, EMPTY, from, merge } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  mergeMap,
  share,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import { v4 as uuid } from 'uuid';
import browser from 'webextension-polyfill';
import {
  waitForResumeSyncResult,
  waitForSyncMessage,
} from './utils/syncReceiveResumeUtil.js';

// 导入user流
import { user$ } from './models/user.ts';
// import { env$ } from "./models/user.ts";
import { wait$ } from './models/preference.ts';
import { message$ } from './models/stream.ts';
import { delay } from './utils/index.ts';
import { findValueByKey } from './utils/json-utils.ts';
import * as RequestListen from './utils/request-listen.ts';
import { request } from './utils/request.ts';
import { installDeclarativeNet } from './utils/with-credentials.ts';

import {
  isConfirmSynchronizationMessage,
  isSyncHtmlMessage,
} from './utils/message-fileter.ts';

// 直接定义消息类型常量
const MessageType = {
  RECEIVE_HTML: 'receive_html',
};
const WS_SERVER =
  import.meta.env.VITE_WS_SERVER || 'ws://web-extension-use.nadileaf.com';

let difyUserName = 'extension-button';
const BACKGROUND_SERVER_HOST =
  import.meta.env.VITE_BACKGROUND_SERVER_HOST ||
  'https://web-extension-use.nadileaf.com';
const Token_Host =
  import.meta.env.VITE_TOKEN_HOST || 'https://tip-test.nadileaf.com';
const spaceServer =
  import.meta.env.VITE_SPACE_SERVER ||
  'https://tip-test.nadileaf.com/api/mesoor-space';
const EntityExecuteHost = `${BACKGROUND_SERVER_HOST}`;

// 输出环境变量日志
console.log('import.meta.env:', import.meta.env);
console.log('环境变量生效配置:', {
  WS_SERVER,
  BACKGROUND_SERVER_HOST,
  Token_Host,
  spaceServer,
  EntityExecuteHost,
});
// 使用{0}表示entityType，{1}表示openId
const syncEntityResultCheckUrl =
  spaceServer + `/v2/entities/{0}/{1}?_proxy=true`;

let requestsHeaderMap = new Map();
let ws = null;
let wait = null;
const tabsObject = {};
/**
 * initial setting
 */
browser.runtime.onInstalled.addListener(async detail => {
  const storage = await browser.storage.sync.get();

  if (!storage.wait) {
    // isSyncWait 为 true 是用户手动同步
    await browser.storage.sync.set({ wait: { isSyncWait: false } });
  }
  const defaultEnv = 'tip-test.nadileaf.com';
  await browser.storage.local.set({ env: defaultEnv, activities: {} });
  console.log('on install setting success...');
});
wait$.subscribe(waitState => (wait = waitState.isSyncWait));

// 加载网站拦截规则
let apiConfig = {
  declarativeNetRequestRules: [
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
        ],
      },
      condition: {
        urlFilter: 'apih.liepin.com/*',
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
          {
            header: 'origin',
            operation: 'set',
            value: 'https://www.duolie.com',
          },
        ],
      },
      condition: {
        urlFilter:
          'api-rcn.duolie.com/api/com.liepin.rcnresume.get-resume-detail',
        resourceTypes: ['xmlhttprequest'],
        tabIds: [-1],
      },
    },
  ],
};
// 需要缓存headers用来重放的url
const needCacheHeadersUrl = [
  // 多猎
  '*://api-rcn.duolie.com/api/com.liepin.rcnresume.get-resume-detail*',
  // 猎聘诚猎通-沟通
  '*://api-h.liepin.com/api/com.liepin.im.h.contact.im-resume-detail',
  // 智联招聘-推荐人才/搜索人才/人才管理
  '*://rd6.zhaopin.com/api/resume/detail*',
  // CGL领英的企业账户搜索页/人才推荐页
  '*://www.linkedin.com/talent/api/talentLinkedInMemberProfiles/*',
  // 实习僧  不知道是哪个接口
  // '*://hr-api-v2.shixiseng.com/api/v1/resume/action*',
  // 实习僧 搜寻人才无附件
  '*://hr-api-v2.shixiseng.com/api/v1/talent/view*',
  // 无忧job沟通
  '*://cupid.51job.com/imchat/open/ehire/chat/resumeDetail*',
  // 无忧job非沟通
  '*://ehirej.51job.com/resumedtl/getresume*',
];
// 需要缓存headers用来重放的url但是不需要拿附件的,是needCacheHeadersUrl的子集
const needCacheHeadersUrlSubStream = [
  '*://api-rcn.duolie.com/api/com.liepin.rcnresume.get-resume-detail*',
  '*://hr-api-v2.shixiseng.com/api/v1/resume/action*',
  '*://hr-api-v2.shixiseng.com/api/v1/talent/view*',
  '*://cupid.51job.com/imchat/open/ehire/chat/resumeDetail*',
  '*://ehirej.51job.com/resumedtl/getresume*',
  '*://api-h.liepin.com/api/com.liepin.im.h.contact.im-resume-detail',
];
// 脉脉招聘页面中简历管理页面的简历手抓
const maimaiResume$ = RequestListen.install([
  // 招人-搜索-2025-07-08
  '*://maimai.cn/api/ent/talent/basic*',
  // 不知道是啥，直接迁移过来了
  '*://maimai.cn/jobs/jobs_resume*',
]);

// 拉勾招聘页面中简历管理页面的简历手抓
const lagouResume$ = RequestListen.install([
  // 招人-搜索-2025-07-08
  '*://gate.lagou.com/v1/zhaopin/orderResumes/detail*',
  // 沟通页面的JSON监听-2025-07-08
  '*://easy.lagou.com/search/resume/fetchResume.json*',
]);
installDeclarativeNet(apiConfig);

async function getTokenFromTip() {
  try {
    const cookies = await browser.cookies.get({
      url: Token_Host,
      name: 'token',
    });
    const token = cookies ? cookies.value : null;
    return token;
  } catch (error) {
    console.error('获取token时出错:', error);
    return null;
  }
}

const token$ = new BehaviorSubject(null);
getTokenFromTip().then(token => {
  console.log('初始化token完成:', token);
  token$.next(token);
});

browser.cookies.onChanged.addListener(changeInfo => {
  if (
    changeInfo.cookie.domain.includes('mesoor.com') &&
    changeInfo.cookie.name === 'token'
  ) {
    console.log('检测到 token cookie 变化:', changeInfo);
    if (!changeInfo.removed) {
      const token = changeInfo.cookie.value;
      console.log('获取到新的 token:', token);
      token$.next(token);
    } else {
      console.log('token 被移除，可能是用户登出');
      token$.next(null);
    }
  }
});

function connectWebSocket(token) {
  if (!token) {
    console.error('No token available');
    return null;
  }

  const wsUrl = `${WS_SERVER}/ws?token=${token}`;
  const socket = new WebSocket(wsUrl);
  let reconnectTimeout;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 100;
  const reconnectDelay = 2000; // 初始重连延迟2秒
  const maxReconnectDelay = 10000; // 最大重连延迟10秒

  socket.onopen = () => {
    console.log('Connected to WebSocket server');
    reconnectAttempts = 0; // 重置重连次数
    socket.send(
      JSON.stringify({
        type: 'auth',
        token: token,
      })
    );
  };

  socket.onmessage = async event => {
    const message = JSON.parse(event.data);
    console.log('Received:', message);
    await handleWebSocketMessage(message);
  };

  socket.onerror = error => {
    console.error('WebSocket error:', error);
  };

  socket.onclose = event => {
    console.log(
      `WebSocket closed with code ${event.code}. Clean: ${event.wasClean}`
    );

    // 如果是正常关闭（比如token变化导致的关闭），不进行重连
    if (event.wasClean) {
      console.log('WebSocket closed cleanly, not attempting to reconnect');
      return;
    }

    // 如果超过最大重试次数，不再重连
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached, giving up');
      return;
    }

    // 使用指数退避策略计算下一次重连延迟，但不超过最大延迟
    const nextDelay = Math.min(
      reconnectDelay * Math.pow(2, reconnectAttempts),
      maxReconnectDelay
    );
    console.log(`Attempting to reconnect in ${nextDelay}ms...`);

    clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(() => {
      reconnectAttempts++;
      console.log(
        `Reconnection attempt ${reconnectAttempts} of ${maxReconnectAttempts}`
      );
      ws = connectWebSocket(token);
    }, nextDelay);
  };

  return socket;
}

// 使用RxJS管理WebSocket连接
token$
  .pipe(
    distinctUntilChanged((prev, curr) => {
      // 只有当两个值都非null且相等时才认为相同
      if (prev === null || curr === null) return false;
      return prev === curr;
    }),
    tap(token => console.log('Token流收到新值:', token)),
    filter(token => token !== null),
    tap(token => console.log('Token非空，准备连接')),
    debounceTime(1000), // 防止频繁重连
    tap(token => console.log('防抖后准备建立连接')),
    switchMap(token => {
      if (ws) {
        // 标记为正常关闭，这样不会触发重连
        ws._normalClose = true;
        ws.close();
      }
      ws = connectWebSocket(token);
      if (!ws) return EMPTY;

      return new Promise(resolve => {
        // 保存原始的onclose处理函数
        const originalOnClose = ws.onclose;
        ws.onclose = event => {
          // 如果是正常关闭（token变化导致），则resolve
          if (ws._normalClose) {
            console.log('WebSocket closed due to token change');
            resolve();
          } else {
            // 否则调用原始的onclose处理函数进行重连
            if (originalOnClose) {
              originalOnClose.call(ws, event);
            }
          }
        };
      });
    })
  )
  .subscribe();

async function handleWebSocketMessage(message) {
  const requestUniqueId = message.requestUniqueId;
  switch (message.actionType) {
    case 'heartbeat':
      ws.send(
        JSON.stringify({
          type: 'pong',
          typeCn: '回复ping',
          requestUniqueId,
        })
      );
      break;
    case 'OpenTabAction':
      if (message.url) {
        try {
          const tab = await browser.tabs.create({ url: message.url });
          const tabId = tab.id;
          console.log('Tab created:', tab);
          const startTime = Date.now();
          const timeout = 10000;
          while (true) {
            if (Date.now() - startTime > timeout) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  typeCn: '打开标签页超时',
                  error: '页面加载超过10秒',
                  windowId: tab.windowId,
                  tabId: tabId,
                  url: message.url,
                  requestUniqueId: requestUniqueId,
                })
              );
              break;
            }

            // 查看tabId是否更新完成
            const updatedTab = await browser.tabs.get(tabId);
            console.log('Tab status:', updatedTab.status);

            if (updatedTab.status === 'complete') {
              // 确保标签页是激活的
              await browser.tabs.update(tabId, { active: true });

              // 等待一小段时间确保页面完全渲染
              await new Promise(resolve => setTimeout(resolve, 500));
              const [response] = await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => ({
                  documentHeight: document.documentElement.scrollHeight,
                  documentWidth: document.documentElement.scrollWidth,
                  viewportHeight: window.innerHeight,
                  viewportWidth: window.innerWidth,
                }),
              });
              // 页面加载完成
              ws.send(
                JSON.stringify({
                  type: 'tabLoaded',
                  typeCn: '标签页加载完成',
                  success: true,
                  tabId: tabId,
                  windowId: tab.windowId,
                  url: updatedTab.url,
                  title: updatedTab.title,
                  requestUniqueId: requestUniqueId,
                  pageMetrics: response.result,
                })
              );
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error('Error opening tab:', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              typeCn: '打开标签页失败',
              error: error.message,
              url: message.url,
              windowId: tab.windowId,
              requestUniqueId: requestUniqueId,
            })
          );
        }
      }
      break;
    case 'ScreenShotAction':
      {
        const result = await handleScreenShot(message);
        if (result.success) {
          ws.send(JSON.stringify(result));
        } else {
          ws.send(
            JSON.stringify({
              type: 'error',
              typeCn: '截图失败',
              error: result.error,
              tabId: message.tabId,
              requestUniqueId: requestUniqueId,
            })
          );
        }
      }
      break;
    case 'GetTabsInfoAction':
      const allWindows = await browser.windows.getAll({ populate: true });
      const tabsInfo = [];

      for (const window of allWindows) {
        for (const tab of window.tabs) {
          try {
            const tabInfo = {
              tabId: tab.id,
              windowId: tab.windowId,
              url: tab.url,
              title: tab.title,
              active: tab.active,
              status: tab.status,
              windowFocused: window.focused,
              lastAccessed: tab.lastAccessed,
              requestUniqueId: requestUniqueId,
            };

            // 如果标签页已完全加载，尝试获取更多信息
            if (tab.status === 'complete') {
              try {
                const [response] = await browser.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: () => ({
                    documentHeight: document.documentElement.scrollHeight,
                    documentWidth: document.documentElement.scrollWidth,
                    viewportHeight: window.innerHeight,
                    viewportWidth: window.innerWidth,
                  }),
                });
                if (response && response.result) {
                  tabInfo.pageMetrics = response.result;
                }
              } catch (e) {
                // 忽略无法执行脚本的标签页（如扩展页面）
                console.log(`Cannot get metrics for tab ${tab.id}:`, e);
              }
            }

            tabsInfo.push(tabInfo);
          } catch (e) {
            console.error(`Error getting info for tab ${tab.id}:`, e);
          }
        }
      }

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'tabsInfo',
            typeCn: '标签页信息',
            timestamp: new Date().toISOString(),
            data: tabsInfo,
            requestUniqueId: requestUniqueId,
          })
        );
      }
      break;
    case 'ClickElementAction':
      {
        try {
          // 先切换到目标标签页
          await browser.tabs.update(message.tabId, { active: true });

          // 在目标标签页中执行点击操作
          const result = await browser.tabs.sendMessage(message.tabId, {
            action: 'ClickElementAction',
            xpath: message.xpath,
          });

          // 发送点击结果
          ws.send(
            JSON.stringify({
              type: 'elementClicked',
              typeCn: '元素点击操作结果',
              success: true,
              tabId: message.tabId,
              xpath: message.xpath,
              requestUniqueId: requestUniqueId,
            })
          );
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: 'error',
              typeCn: '元素点击失败',
              error: error.message,
              tabId: message.tabId,
              xpath: message.xpath,
              requestUniqueId: requestUniqueId,
            })
          );
        }
      }
      break;
    case 'SendKeyAction':
      if (!message.tabId || !message.xpath || message.value === undefined) {
        ws.send(
          JSON.stringify({
            type: 'error',
            typeCn: '参数错误',
            error: '缺少必要参数 tabId、xpath 或 value',
            requestUniqueId: requestUniqueId,
          })
        );
        break;
      }

      try {
        const tab = await browser.tabs.get(message.tabId);
        // 先切换到目标标签页
        await browser.tabs.update(message.tabId, { active: true });

        // 在目标标签页中执行输入操作
        const result = await browser.tabs.sendMessage(message.tabId, {
          action: 'SendKeyAction',
          xpath: message.xpath,
          value: message.value,
        });

        if (result.success) {
          // 发送输入结果
          ws.send(
            JSON.stringify({
              type: 'SendKeyAction',
              typeCn: '文本输入操作结果',
              success: true,
              tabId: message.tabId,
              xpath: message.xpath,
              property: message.value,
              windowId: tab.windowId,
              requestUniqueId: requestUniqueId,
              element: result.element,
            })
          );
        } else {
          ws.send(
            JSON.stringify({
              type: 'error',
              typeCn: '文本输入失败',
              error: result.error,
              tabId: message.tabId,
              xpath: message.xpath,
              value: message.value,
              windowId: tab.windowId,
              requestUniqueId: requestUniqueId,
            })
          );
        }
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: 'error',
            typeCn: '文本输入失败',
            error: error.message,
            tabId: message.tabId,
            xpath: message.xpath,
            property: message.value,
            requestUniqueId: requestUniqueId,
          })
        );
      }
      break;
    case 'SwitchTabAction':
      try {
        await browser.tabs.update(message.tabId, { active: true });
        const startTime = Date.now();
        const timeout = 10000;
        while (true) {
          if (Date.now() - startTime > timeout) {
            ws.send(
              JSON.stringify({
                type: 'error',
                typeCn: '切换标签页超时',
                error: '页面加载超过10秒',
                tabId: message.tabId,
                windowId: tab.windowId,
                requestUniqueId: requestUniqueId,
              })
            );
            break;
          }
          const tab = await browser.tabs.get(message.tabId);
          console.log('Tab status:', tab.status);

          if (tab.status === 'complete') {
            const window = await browser.windows.get(tab.windowId);
            let pageInfo = {};
            if (tab.status === 'complete') {
              try {
                const [result] = await browser.scripting.executeScript({
                  target: { tabId: tab.id },
                  function: () => ({
                    documentHeight: document.documentElement.scrollHeight,
                    documentWidth: document.documentElement.scrollWidth,
                    viewportHeight: window.innerHeight,
                    viewportWidth: window.innerWidth,
                    title: document.title,
                    url: window.location.href,
                  }),
                });
                pageInfo = result.result;
              } catch (e) {
                console.error('Error getting page metrics:', e);
              }
            }
            ws.send(
              JSON.stringify({
                type: 'tabSwitched',
                typeCn: '标签页切换成功',
                success: true,
                tabId: tab.id,
                url: tab.url,
                title: tab.title,
                windowId: tab.windowId,
                active: tab.active,
                status: tab.status,
                windowFocused: window.focused,
                lastAccessed: tab.lastAccessed,
                pageMetrics: pageInfo,
                requestUniqueId: requestUniqueId,
              })
            );
            break;
          }
          // 等待100ms后再次检查
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error('Error switching tab:', error);
        ws.send(
          JSON.stringify({
            type: 'error',
            typeCn: '切换标签页失败',
            error: error.message,
            tabId: message.tabId,
            requestUniqueId: requestUniqueId,
          })
        );
      }
      break;
    case 'ScrollAction':
      if (message.tabId) {
        try {
          // 先切换到目标标签页
          await browser.tabs.update(message.tabId, { active: true });

          // 在目标标签页中执行滚动操作
          const result = await browser.tabs.sendMessage(message.tabId, {
            action: 'ScrollAction',
            positionX: message.positionX,
            positionY: message.positionY,
            xpath: message.xpath,
            smooth: message.smooth !== false,
          });

          // 发送滚动结果
          ws.send(
            JSON.stringify({
              type: 'scrollComplete',
              typeCn: '页面滚动操作结果',
              success: true,
              // windowId: tab.windowId,
              tabId: message.tabId,
              ...result,
              requestUniqueId: requestUniqueId,
            })
          );
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: 'error',
              typeCn: '页面滚动失败',
              error: error.message,
              // windowId: tab.windowId,
              tabId: message.tabId,
              requestUniqueId: requestUniqueId,
            })
          );
        }
      }
      break;
    case 'HighlightElementsAction':
    case 'RemoveHighlightAction':
      {
        try {
          const result = await browser.tabs.sendMessage(message.tabId, {
            action: message.actionType,
          });
          console.log(result);
          if (result) {
            ws.send(
              JSON.stringify({
                type: message.actionType,
                success: true,
                tabId: message.tabId,
                requestUniqueId: requestUniqueId,
                domTree: result.domTree,
                html: result.originalHTML,
              })
            );
          } else {
            console.error(result.error);
            throw new Error(result.error || '高亮元素失败');
          }
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: 'error',
              typeCn: '高亮元素失败',
              error: error.message,
              tabId: message.tabId,
              requestUniqueId: requestUniqueId,
            })
          );
        }
      }
      break;
    case 'SidebarChatMessageAction':
      if (message.tabId && message.data) {
        try {
          // 获取当前标签页
          const tab = await browser.tabs.get(message.tabId);
          if (!tab) {
            throw new Error('Tab not found');
          }
          for (const data of message.data) {
            const response = await browser.runtime.sendMessage({
              type: 'sidebarMessage',
              tabId: message.tabId,
              content: data,
            });
          }
          // 发送成功响应
          ws.send(
            JSON.stringify({
              type: message.actionType,
              typeCn: '展示信息',
              success: true,
              tabId: message.tabId,
              requestUniqueId: requestUniqueId,
            })
          );
        } catch (error) {
          console.error('Error sending message:', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Failed to send message: ' + error.message,
            })
          );
        }
      } else {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
          })
        );
      }
      break;
    case 'FileUploadAction':
      if (message.tabId && message.file) {
        try {
          // 发送文件数据到 WebSocket 服务器
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'file_upload',
                data: {
                  name: message.file.name,
                  content: message.file.content,
                  size: message.file.size,
                  mimeType: message.file.mimeType,
                  timestamp: new Date().getTime(),
                },
              })
            );
          }
        } catch (error) {
          console.error('Error sending file:', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Failed to send file: ' + error.message,
            })
          );
        }
      } else {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Invalid file format',
          })
        );
      }
      break;
    case 'file_upload_response':
      // 向所有相关标签页广播文件上传结果
      browser.tabs.query({}).then(tabs => {
        tabs.forEach(tab => {
          browser.tabs.sendMessage(tab.id, {
            type: 'file_upload_status',
            data: message.data,
          });
        });
      });
      break;
    case 'SendLogMessageAction':
      console.log('Sending log message:', message);
      browser.runtime.sendMessage({
        type: 'SendLogMessageAction',
        data: {
          level: message.level,
          content: message.content,
          duration: message.duration,
          dangerouslyUseHTMLString: message.dangerouslyUseHTMLString,
          grouping: message.grouping,
        },
      });
      ws.send(
        JSON.stringify({
          type: message.actionType,
          success: true,
          requestUniqueId: requestUniqueId,
          receivedMessage: {
            actionType: message.actionType,
            ...message,
          },
        })
      );
      break;
    case 'ClearKeyAction':
      if (!message.tabId || !message.xpath) {
        ws.send(
          JSON.stringify({
            type: 'error',
            typeCn: '参数错误',
            error: '缺少必要参数 tabId、xpath',
            requestUniqueId: requestUniqueId,
          })
        );
        break;
      }

      try {
        const tab = await browser.tabs.get(message.tabId);
        // 先切换到目标标签页
        await browser.tabs.update(message.tabId, { active: true });

        // 在目标标签页中执行输入操作
        const result = await browser.tabs.sendMessage(message.tabId, {
          action: 'ClearKeyAction',
          xpath: message.xpath,
          value: message.value,
        });

        if (result.success) {
          // 发送输入结果
          ws.send(
            JSON.stringify({
              type: 'ClearKeyAction',
              typeCn: '文本清除操作结果',
              success: true,
              tabId: message.tabId,
              xpath: message.xpath,
              windowId: tab.windowId,
              requestUniqueId: requestUniqueId,
              element: result.element,
            })
          );
        } else {
          ws.send(
            JSON.stringify({
              type: 'error',
              typeCn: '文本清除失败',
              error: result.error,
              tabId: message.tabId,
              xpath: message.xpath,
              windowId: tab.windowId,
              requestUniqueId: requestUniqueId,
            })
          );
        }
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: 'error',
            typeCn: '文本输入失败',
            error: error.message,
            tabId: message.tabId,
            xpath: message.xpath,
            property: message.value,
            requestUniqueId: requestUniqueId,
          })
        );
      }
      break;

    // 处理按键模拟操作
    case 'KeypressAction':
      // 转发按键操作到当前活动标签页
      const result = await browser.tabs.sendMessage(message.tabId, {
        action: 'KeypressAction',
        data: {
          key: message.key,
          xpath: message.xpath,
          requestUniqueId: message.requestUniqueId,
        },
      });
      if (result.success) {
        // 发送输入结果
        ws.send(
          JSON.stringify({
            type: 'KeypressAction',
            typeCn: '按键模拟操作结果',
            success: true,
            tabId: message.tabId,
            xpath: message.xpath,
            windowId: message.windowId,
            requestUniqueId: requestUniqueId,
            element: result.element,
          })
        );
      } else {
        ws.send(
          JSON.stringify({
            type: 'KeypressAction',
            typeCn: '按键模拟操作失败',
            error: result.error,
            tabId: message.tabId,
            xpath: message.xpath,
            windowId: message.windowId,
            requestUniqueId: requestUniqueId,
          })
        );
      }
      break;

    default:
      // 处理未知的 actionType
      ws.send(
        JSON.stringify({
          type: 'error',
          typeCn: '未知操作类型',
          success: false,
          error: `不支持的操作类型: ${message.actionType}`,
          requestUniqueId: requestUniqueId,
          receivedMessage: {
            actionType: message.actionType,
            ...message,
          },
        })
      );
      break;
  }
}

// 截图限制处理
async function captureVisibleTabWithRetry(windowId, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await browser.tabs.captureVisibleTab(windowId, options);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

// 处理截图动作
async function handleScreenShot(message) {
  const { tabId, viewPort, requestUniqueId } = message;

  try {
    const tab = await browser.tabs.update(tabId, { active: true });

    if (!tab.id) {
      return {
        type: 'error',
        typeCn: '截图失败',
        error: '无效的标签页ID',
        tabId: tabId,
        requestUniqueId: requestUniqueId,
      };
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    if (viewPort) {
      // 视窗截图
      const screenshot = await captureVisibleTabWithRetry(tab.windowId, {
        format: 'png',
      });
      return {
        type: 'ScreenShotAction',
        typeCn: '截图结果',
        success: true,
        tabId: tab.id,
        requestUniqueId: requestUniqueId,
        screenshot: screenshot,
      };
    } else {
      // 长截图
      // 获取页面信息
      const [pageInfo] = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return {
            scrollWidth: Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth
            ),
            scrollHeight: Math.max(
              document.documentElement.scrollHeight,
              document.body.scrollHeight
            ),
            devicePixelRatio: window.devicePixelRatio,
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
          };
        },
      });

      const { scrollWidth, scrollHeight, devicePixelRatio, viewportHeight } =
        pageInfo.result;

      // 创建离屏 canvas
      const canvas = new OffscreenCanvas(
        Math.ceil(scrollWidth * devicePixelRatio),
        Math.ceil(scrollHeight * devicePixelRatio)
      );
      const ctx = canvas.getContext('2d');
      ctx.scale(devicePixelRatio, devicePixelRatio);

      // 分段截图，控制速率
      const segments = Math.ceil(scrollHeight / viewportHeight);

      for (let i = 0; i < segments; i++) {
        // 滚动到指定位置并等待滚动完成
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: y => {
            return new Promise(resolve => {
              window.scrollTo(0, y);
              // 使用 requestAnimationFrame 确保滚动已完成
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  // 再次确认滚动位置正确
                  if (Math.abs(window.scrollY - y) > 1) {
                    window.scrollTo(0, y);
                  }
                  resolve();
                });
              });
            });
          },
          args: [i * viewportHeight],
        });

        // 等待页面重绘和限制速率
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 截取当前视口，带重试机制
        const dataUrl = await captureVisibleTabWithRetry(tab.windowId, {
          format: 'png',
        });

        // 将截图绘制到 canvas
        const img = await createImageBitmap(
          await (await fetch(dataUrl)).blob()
        );
        ctx.drawImage(
          img,
          0,
          i * viewportHeight,
          scrollWidth,
          Math.min(viewportHeight, scrollHeight - i * viewportHeight)
        );

        console.log(`截图进度: ${Math.min(100, ((i + 1) / segments) * 100)}%`);
      }

      // 恢复滚动位置
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return new Promise(resolve => {
            window.scrollTo(0, 0);
            requestAnimationFrame(() => {
              requestAnimationFrame(resolve);
            });
          });
        },
      });

      // 转换为 base64
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const base64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      return {
        type: 'ScreenShotAction',
        typeCn: '截图结果',
        success: true,
        tabId: tab.id,
        requestUniqueId: requestUniqueId,
        screenshot: base64,
      };
    }
  } catch (error) {
    console.error('截图错误:', error);
    return {
      type: 'error',
      typeCn: '截图失败',
      error: error.message,
      tabId: tabId,
      requestUniqueId: requestUniqueId,
    };
  }
}

// 处理来自content script或popup的消息
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'pingMesoorExtension') {
    sendResponse({ message: 'pingMesoorExtensionSuccess' });
  }

  if (
    request.type === 'sendWebSocketMessage' &&
    ws &&
    ws.readyState === WebSocket.OPEN
  ) {
    try {
      ws.send(
        JSON.stringify({
          ...request.data,
          token: TOKEN,
          requestUniqueId: Date.now().toString(),
        })
      );
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      sendResponse({ success: false, error: error.message });
    }
  } else if (['submitResume', 'publishJob'].includes(request.type)) {
    // 处理插件按钮触发
    console.log('处理插件按钮触发', request);
    injectButton2dify(request.url, sender.tab.id, request.config)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('简历提交失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.type === 'check-job-des') {
    console.log('处理检查职位描述', JSON.stringify(request));
    const tabId = sender.tab.id;

    // 检查请求对象的结构
    if (!request.payload) {
      console.log('请求对象结构错误，缺少payload字段');
      sendResponse({ success: false, error: '请求结构错误' });
      return true;
    }

    // 打印完整的请求信息
    console.log(
      '发送职位描述检查请求，完整内容:',
      JSON.stringify({
        language: request.payload.language,
        jobdesc: request.payload.jobdesc
          ? request.payload.jobdesc.substring(0, 100) + '...'
          : '空',
        location: request.payload.location,
      })
    );

    // 准备请求体
    const requestBody = {
      inputs: {
        language: request.payload.language,
        jobdesc: request.payload.jobdesc,
        location: request.payload.location,
      },
      response_mode: 'blocking',
      user: difyUserName,
    };

    console.log('发送请求体:', JSON.stringify(requestBody));

    // 使用传统的Promise方式发送请求
    fetch('https://agent.mesoor.com/v1/workflows/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer app-0ZlQjjuIWhJLVDYyxz2EEl8n',
      },
      body: JSON.stringify(requestBody),
    })
      .then(response => {
        console.log('收到响应，状态码:', response.status);

        if (!response.ok) {
          return response.text().then(errorText => {
            console.error('请求失败详情:', errorText);
            throw new Error(
              `请求失败: ${response.status} ${response.statusText}`
            );
          });
        }

        return response.json();
      })
      .then(data => {
        console.log('检查职位描述结果:', JSON.stringify(data));

        // 检查响应数据结构
        if (!data.data || !data.data.outputs) {
          console.error('响应数据结构错误:', JSON.stringify(data));
          throw new Error('响应数据结构错误');
        }

        // 发送消息到内容脚本
        console.log('发送消息到标签:', tabId);
        return browser.tabs
          .sendMessage(tabId, {
            type: 'update-check-job-content',
            payload: {
              checkResult: data.data.outputs.checkResult,
              fixJobDes: data.data.outputs.fixJobDes,
            },
          })
          .then(() => {
            console.log('消息发送成功');
            return data; // 返回数据以便后续处理
          })
          .catch(err => {
            console.error('消息发送失败:', err);
            return data; // 即使消息发送失败也返回数据
          });
      })
      .then(data => {
        sendResponse({ success: true, result: data });
      })
      .catch(error => {
        console.error('检查职位描述失败:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // 异步响应需要返回true
  } else if (request.type === 'view-resume-send-mail') {
    console.log('处理发送邮件', JSON.stringify(request));
    const match = request.payload.url.match(/profile\/([^?&]+)/);
    let profileId = '';
    if (!match && !request.payload.profileId) {
      console.error('无法获取 profileId');
      sendResponse({ success: false, error: '无法获取 profileId' });
      return;
    } else if (match) {
      profileId = match[1];
    } else {
      profileId = request.payload.profileId;
    }
    (async () => {
      try {
        // 获取领英简历
        // 获取所有 cookie
        // const cookies = await browser.cookies.getAll({ domain: 'linkedin.com' });
        // 获取 JSESSIONID cookie
        const ajaxTokenCookie = await browser.cookies.get({
          url: request.payload.url,
          name: 'JSESSIONID',
        });
        if (!ajaxTokenCookie) {
          console.error('无法获取 JSESSIONID cookie');
          return;
        }

        const ajaxToken = ajaxTokenCookie.value.replace(/^"(.*)"$/, '$1');
        let cookieString = '';

        for (let cookieItem of await browser.cookies.getAll({
          domain: 'linkedin.com',
        })) {
          cookieString += `${cookieItem.name}=${cookieItem.value}; `;
        }

        const requestHeaders = {
          cookies: cookieString,
          'Content-Type': 'application/json',
          'x-restli-protocol-version': '2.0.0',
          'csrf-token': ajaxToken,
          'x-http-method-override': 'GET',
          // 中文优先必加
          'x-li-lang': 'zh_CN',
        };
        const _url = `http://www.linkedin.com/talent/api/talentLinkedInMemberProfiles/urn:li:ts_linkedin_member_profile:(${profileId},1,urn:li:ts_hiring_project:0)`;
        const requestData =
          'altkey=urn&decoration=(entityUrn%2CcurrentResumePosition%2CreferenceUrn%2Canonymized%2CunobfuscatedFirstName%2CunobfuscatedLastName%2CmemberPreferences(availableStartingAt%2Clocations%2CgeoLocations*~(standardGeoStyleName)%2CopenToNewOpportunities%2Ctitles%2CinterestedCandidateIntroductionStatement%2Cindustries*~%2CcompanySizeRange%2CemploymentTypes%2Cbenefits%2Cschedules%2CsalaryLowerBounds%2Ccommute%2CjobSeekingUrgencyLevel%2CopenToWorkRemotely%2ClocalizedWorkplaceTypes%2CremoteGeoLocationUrns*~(standardGeoStyleName)%2CsegmentAttributeGroups*(attributeUrn~(localizedName)%2CattributeValueUrns*~(localizedName)))%2CfirstName%2ClastName%2Cheadline%2Clocation%2CprofilePicture%2CvectorProfilePicture%2CnumConnections%2Csummary%2CnetworkDistance%2CprofileSkills*(name%2CtopSkill%2CtopVoiceBadge%2CskillAssessmentBadge%2CprofileResume%2CendorsementCount%2CprofileSkillAssociationsGroupUrn~(entityUrn%2Cassociations*(description%2Ctype%2CorganizationUrn~(name%2Curl%2Clogo)))%2ChasInsight)%2CpublicProfileUrl%2CcontactInfo%2Cwebsites*%2CcanSendInMail%2Cunlinked%2CunLinkedMigrated%2Chighlights(connections(connections*~(entityUrn%2CfirstName%2ClastName%2Cheadline%2CprofilePicture%2CvectorProfilePicture%2CpublicProfileUrl%2CfollowerCount%2CnetworkDistance%2CautomatedActionProfile)%2CtotalCount)%2Ccompanies(companies*(company~(followerCount%2Cname)%2CoverlapInfo))%2Cschools(schools*(school~(name)%2CschoolOrganizationUrn~(name)%2CoverlapInfo)))%2Ceducations*(school~(name)%2CorganizationUrn~(name)%2CschoolName%2Cgrade%2Cdescription%2CdegreeName%2CfieldOfStudy%2CstartDateOn%2CendDateOn)%2CgroupedWorkExperience*(companyUrn~(followerCount%2Cname)%2Cpositions*(profileResume%2Ctitle%2CstartDateOn%2CendDateOn%2Cdescription%2Clocation)%2CstartDateOn%2CendDateOn)%2CvolunteeringExperiences*(company~(followerCount%2Cname)%2CcompanyName%2Crole%2CstartDateOn%2CendDateOn%2Cdescription)%2Crecommendations*(recommender~(entityUrn%2CfirstName%2ClastName%2Cheadline%2CprofilePicture%2CvectorProfilePicture%2CpublicProfileUrl%2CfollowerCount%2CnetworkDistance%2CautomatedActionProfile)%2CrecommendationText%2Crelationship%2Ccreated)%2Caccomplishments(projects*(title%2Cdescription%2CstartDateOn%2CendDateOn%2CsingleDate%2Ccontributors*(name%2ClinkedInMember~(entityUrn%2Canonymized%2CunobfuscatedFirstName%2CunobfuscatedLastName%2CfirstName%2ClastName%2Cheadline%2CprofilePicture%2CvectorProfilePicture%2CpublicProfileUrl%2CfollowerCount%2CnetworkDistance%2CautomatedActionProfile)))%2Ccourses*%2Clanguages*%2Cpublications*(name%2Cpublisher%2Cdescription%2CdateOn%2Cauthors*(name%2ClinkedInMember~(entityUrn%2Canonymized%2CunobfuscatedFirstName%2CunobfuscatedLastName%2CfirstName%2ClastName%2Cheadline%2CprofilePicture%2CvectorProfilePicture%2CpublicProfileUrl%2CfollowerCount%2CnetworkDistance%2CautomatedActionProfile)))%2Cpatents*(number%2CapplicationNumber%2Ctitle%2Cissuer%2Cpending%2Curl%2CfilingDateOn%2CissueDateOn%2Cdescription%2Cinventors*(name%2ClinkedInMember~(entityUrn%2Canonymized%2CunobfuscatedFirstName%2CunobfuscatedLastName%2CfirstName%2ClastName%2Cheadline%2CprofilePicture%2CvectorProfilePicture%2CpublicProfileUrl%2CfollowerCount%2CnetworkDistance%2CautomatedActionProfile)))%2CtestScores*%2Chonors*%2Ccertifications*(name%2ClicenseNumber%2Cauthority%2Ccompany~(followerCount%2Cname)%2Curl%2CstartDateOn%2CendDateOn))%2ClegacyCapAuthToken%2CfullProfileNotVisible%2CcurrentPositions*(company~(followerCount%2Cname%2Curl%2CvectorLogo)%2CcompanyName%2Ctitle%2CstartDateOn%2CendDateOn%2Cdescription%2Clocation)%2CindustryName%2ChasProfileVerifications)';

        try {
          const baseResumeResponse = await fetch(_url, {
            headers: requestHeaders,
            body: requestData,
            method: 'POST',
          });

          const _linkedinResume = await baseResumeResponse.json();
          const linkedinResume = {
            ..._linkedinResume,
            tipFirstName: _linkedinResume.firstName,
            tipLastName: _linkedinResume.lastName,
          };
          console.info('background running -> resume:', linkedinResume);
          const _converted = await fetch(
            'http://effex-configs.mesoor.com/v1/configs/invoke',
            {
              headers: {
                'Content-Type': 'application/json',
                // 'Authorization': `Bearer ${user.token}`,
              },
              body: JSON.stringify({
                config_id: 'standard-convert-LinkedInPC_to_resume-public',
                data: { data: linkedinResume },
                input_json_as_string: true,
                output_json_as_string: false,
              }),
              method: 'POST',
            }
          );
          let resume = await _converted.json();
          resume = {
            ...resume,
            tipFirstName: _linkedinResume.firstName,
            tipLastName: _linkedinResume.lastName,
          };
          console.info('resume-converted:', resume);

          const getInMail = await fetch(
            'https://agent.mesoor.com/v1/workflows/run',
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer app-Omm8AOuKndljipT74AExVKM1',
              },
              body: JSON.stringify({
                inputs: {
                  input_data: JSON.stringify(resume),
                  company: request.payload.company,
                  jobdesc: request.payload.jobdesc,
                  consultant: request.payload.consultant,
                  tone: request.payload.tone,
                  confidential: request.payload.confidential,
                },
                response_mode: 'blocking',
                user: difyUserName,
              }),
              method: 'POST',
            }
          );
          const inMailInfo = await getInMail.json();
          const inMailcontent = inMailInfo.data.outputs.text;
          console.info('background running -> inMailcontent:', inMailcontent);
          await browser.tabs.sendMessage(sender.tab.id, {
            type: 'update-mail-content',
            payload: {
              content: inMailcontent,
              company: request.payload.company,
              jobdesc: request.payload.jobdesc,
              consultant: request.payload.consultant,
              tone: request.payload.tone,
              link: request.payload.link || '',
              confidential: request.payload.confidential,
              profileId: profileId,
            },
          });
          // 返回数据给发送者
          sendResponse({ success: true, data: resume });
        } catch (fetchError) {
          console.error('获取简历数据失败:', fetchError);
          sendResponse({ success: false, error: fetchError.message });
        }
      } catch (error) {
        console.error('处理 cookie 失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // 异步响应需要返回true
  }
});

// 处理扩展图标点击事件
browser.action.onClicked.addListener(async tab => {
  browser.sidePanel.open({ tabId: tab.id });
});

// 直接从 cookie 中获取 token
async function getTokenFromCookie() {
  try {
    const token_obj = await browser.cookies.get({
      url: 'https://tip.mesoor.com',
      name: 'token',
    });
    if (token_obj && token_obj.value) {
      return token_obj.value;
    }
    return null;
  } catch (error) {
    console.error('获取 token 时出错:', error);
    return null;
  }
}

// 当用户触发Dify AI-Source的链接时里的Get请求时是没带token的，
// 所以需要在请求发送前的事件中添加token重放请求
browser.webRequest.onBeforeRequest.addListener(
  details => {
    // 只处理来自标签页的GET请求
    if (details.tabId !== -1 && details.method === 'GET') {
      (async () => {
        try {
          // 直接从 cookie 中获取 token
          const token = await getTokenFromCookie();

          if (token) {
            const response = await fetch(details.url, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            if (response.ok) {
              const data = await response.json();
            } else {
              console.info('请求失败，状态码:', response.status);
            }
          } else {
            console.info('没有从 cookie 中获取到 token，不重新发送请求');
          }
        } catch (error) {
          console.error('重新发送请求时出错:', error);
        }
      })();
    }
  },
  {
    urls: [
      '*://web-extension-use.mesoor.com/v1/actions/configs/id*',
      'http://localhost:8080/v1/actions/configs/id*',
      'https://localhost:8080/v1/actions/configs/id*',
    ],
  }
);

// 功能: 注入按钮提交到Dify
async function injectButton2dify(url, tabId, config) {
  try {
    console.log('注入按钮:', url, tabId, config);
    const token = await getTokenFromTip();
    if (!token) {
      throw new Error('无法获取认证token');
    }
    const postData = {
      inputs: {
        config: config,
        token: token,
        tabId: tabId,
      },
      response_mode: 'blocking',
      user: difyUserName,
    };
    const response = await fetch('https://agent.mesoor.com/v1/workflows/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer app-q7ip7PqzrLJGc4siEtBhrjay',
      },
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`请求失败: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log('简历提交成功:', result);

    return result;
  } catch (error) {
    console.error('简历提交处理失败:', error);
    throw error;
  }
}

connectWebSocket();
// 前程无忧
// 人才管理-HTML解析
// 人才望远镜-HTML解析
// 人才搜索—HTML解析
// 人才库-HTML解析
// 人才沟通-request

// 定义匹配的 URL 模式正则数组
const urlPatterns = [
  // 猎聘诚猎通
  /h\.liepin\.com\/resume\/showresumedetail/,
  // 前程无忧
  // 人才管理 人才望远镜 人才搜索 人才库
  /ehire\.51job\.com\/Revision\/talent\/resume\/detail/,
  // 领英
  // 个人首页
  /linkedin\.com\/in\//,
  // 企业招聘账户搜索
  /linkedin\.com\/talent\/hire\/\d+\/discover\/recruiterSearch\/profile\//,
  // 人才推荐
  /linkedin\.com\/talent\/hire\/\d+\/discover\/automatedSourcing\/review\/profile\//,
  // 备选人才
  /linkedin\.com\/talent\/hire\/\d+\/manage\/all\/profile\//,
  // 备选人才各个阶段
  /linkedin\.com\/talent\/hire\/\d+\/manage\/\d+\/profile\//,
  // 脉脉
  /www\.maimai\.cn\/profile\/detail\//,
  //
];

// 检查 URL 是否匹配任一模式
function isUrlMatched(url) {
  if (!url) return false;
  console.log('检查URL是否匹配:', url);
  return urlPatterns.some(pattern => pattern.test(url));
}

// 直接使用浏览器 API 监听 tab 更新事件
console.log('开始设置 tab 更新监听器...');

// browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//     console.log('Tab 更新事件触发:', { tabId, changeInfo, url: tab.url })
//     // 只处理页面加载完成的事件
//     if (changeInfo.status === 'complete' && tab.url) {
//         console.log('页面加载完成:', tab.url);
//         console.log('Tab:', tab);

//         // 检查 URL 是否匹配
//         if (isUrlMatched(tab.url)) {
//             console.log('URL 匹配成功，准备发送消息:', tab.url);

//             // 获取当前 token
//             const currentToken = tokenSubject.getValue();

//             // 如果没有 token，不执行后续操作
//             if (!currentToken) {
//                 console.warn('没有有效的 token，不执行 HTML 获取和 API 发送操作');
//                 return;
//             }

//             // 发送消息到 content script
//             browser.tabs.sendMessage(tabId, {
//                 type: MessageType.RECEIVE_HTML // 使用正确的消息类型
//             }).then(response => {
//                 console.log(`成功向 tab ${tabId} 发送消息，响应:`, response);

//                 // 处理返回的 HTML 内容
//                 if (response && response.html) {
//                     console.log(`成功获取 HTML 内容，长度: ${response.html.length}`);
//                     // 发送 HTML 内容到接口
//                     fetch('http://localhost:8080/parser/auto', {
//                         method: 'POST',
//                         headers: {
//                             'Content-Type': 'application/json',
//                             'Authorization': `Bearer ${currentToken}`
//                         },
//                         body: JSON.stringify({
//                             html: response.html,
//                             url: tab.url,
//                             title: tab.title,
//                             tabId: tabId,
//                         })
//                     })
//                     .then(apiResponse => apiResponse.json())
//                     .then(data => {
//                         console.log('API 响应成功:', data);
//                     })
//                     .catch(error => {
//                         console.error('发送 HTML 到 API 失败:', error);
//                     });

//                     // 这里可以进一步处理 HTML 内容
//                     console.log(`成功获取 HTML 内容，内容: ${response.html}`);
//                 } else {
//                     console.warn(`没有收到 HTML 内容或内容为空`);
//                 }
//             }).catch(error => {
//                 console.error(`向 tab ${tabId} 发送消息失败:`, error);
//             });
//         }
//     }
// });

// const cacheHeaders$ = RequestListen.installOnBeforeSendHeaders([
//     '*://api-rcn.duolie.com/api/com.liepin.rcnresume.get-resume-detail*',
//   ])

// cacheHeaders$
// .pipe(
// withLatestFrom(user$),
// filter(([details]) => details.tabId !== -1 && details.method !== 'OPTIONS'),
// )
// .subscribe(async ([details]) => {
//     logger.debug('cacheHeaders details', details)
//     requestsHeaderMap.set(details.requestId, {
//     url: details.url,
//     method: details.method,
//     timeStamp: details.timeStamp,
//     headers: details.requestHeaders,
//     });
// },
// )

// 简历收录部分

const maimaiResumeLast$ = maimaiResume$.pipe(
  filter(details => details.tabId !== -1),
  tap(details => {
    console.log('maimaiResume details', details);
  }),
  mergeMap(async details => {
    await delay(1500);
    const resp = await request(details.url);
    let fileContentB64 = null;
    const data = await resp.json();
    if (data?.data?.resume?.file_url) {
      const fileResp = await request(data.data.resume.file_url);
      const blob = await fileResp.blob();
      fileContentB64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result.split(',')[1]);
          } else {
            resolve('');
          }
        };
      });
    }
    const body = {
      jsonBody: data,
      requestURL: details.url,
      fileContentB64: fileContentB64
        ? [
            {
              fileContentB64: fileContentB64,
              type: 'resumeAttachment',
              responseHeaders: fileResp.headers,
            },
          ]
        : null,
    };
    return {
      details,
      body,
    };
  })
);

const lagouResumeReplay$ = lagouResume$.pipe(
  filter(details => details.tabId !== -1),
  tap(details => {
    console.log('lagouResume details', details);
  }),
  mergeMap(async details => {
    const requestId = uuid();
    // 不加这个就被判断非法访问
    const add_headers = { 'X-L-REQ-HEADER': '{"deviceType":1}' };
    const resp = await request(details.url, { headers: add_headers });
    const data = await resp.json();
    return {
      details,
      data,
      requestId,
    };
  }),
  tap(({ details }) => {
    console.log('lagouResumeReplay details', details);
  }),
  share()
);

const lagouCommunicationLastResume$ = lagouResumeReplay$.pipe(
  filter(({ details }) => details.url.includes('fetchResume.json')),
  mergeMap(async ({ details, data }) => {
    let fileContentB64 = null;
    const attachmentResumeId = findValueByKey(data, 'attachmentResumeId');
    if (attachmentResumeId) {
      const resumeFetchUrl = `https://easy.lagou.com/pub/pc/nearbyPreview.json?attachmentResumeId=${attachmentResumeId}`;
      const fileResp = await request(resumeFetchUrl);

      // 检查响应头，如果没有content-disposition，说明附件不存在
      const contentDisposition = fileResp.headers.get('content-disposition');
      if (!contentDisposition) {
        console.log(
          `附件不存在，缺少content-disposition响应头: ${resumeFetchUrl}`
        );
        fileContentB64 = null;
      } else {
        const blob = await fileResp.blob();
        fileContentB64 = await new Promise(resolve => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              resolve(reader.result.split(',')[1]);
            } else {
              resolve('');
            }
          };
        });
      }
    }
    const body = {
      jsonBody: data,
      url: details.url,
      fileContentB64: fileContentB64
        ? [
            {
              fileContentB64: fileContentB64,
              type: 'resumeAttachment',
              responseHeaders: fileResp.headers,
            },
          ]
        : null,
    };
    return {
      details,
      body,
    };
  })
);

// 招人、简历库简历流
const lagouOrderResume$ = lagouResumeReplay$.pipe(
  filter(({ details }) =>
    details.url.includes('gate.lagou.com/v1/zhaopin/orderResumes/detail')
  ),
  mergeMap(async ({ details, data }) => {
    let fileContentB64 = null;
    // 创建一个PDF文档
    const pdf = new jsPDF();
    // 简历页面的附件
    const resumeId = data?.content?.briefInfo?.id;
    if (resumeId) {
      const getAttachmentIndexUrl = `https://easy.lagou.com/resume/preview_info.json?resumeId=${resumeId}`;
      const fileRespIndexResponse = await request(getAttachmentIndexUrl);
      const attachmentIndex = await fileRespIndexResponse.json();
      const maxPage =
        attachmentIndex?.content?.data?.showTabs?.nearby?.pageCount;
      if (maxPage) {
        const imageBlobs = [];
        for (let index = 0; index < maxPage; index++) {
          const getAttachmentUrl = `https://easy.lagou.com/resume/${resumeId}/page_image_${index}.pnga?preview=2`;
          const fileResp = await request(getAttachmentUrl);
          const blob = await fileResp.blob();
          imageBlobs.push(blob);
        }
        for (let i = 0; i < imageBlobs.length; i++) {
          const blob = imageBlobs[i];
          const imgData = await new Promise(resolve => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                resolve(reader.result);
              } else {
                resolve('');
              }
            };
          });
          if (i > 0) {
            pdf.addPage();
          }
          const imgDataClean = imgData.split(',')[1];
          if (imgDataClean) {
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = imgProps.width;
            const imgHeight = imgProps.height;

            // 计算缩放比例，使图片适应页面
            const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
            const scaledWidth = imgWidth * ratio;
            const scaledHeight = imgHeight * ratio;

            // 居中图片
            const x = (pdfWidth - scaledWidth) / 2;
            const y = (pdfHeight - scaledHeight) / 2;

            pdf.addImage(imgData, 'PNG', x, y, scaledWidth, scaledHeight);
          }
        }
        fileContentB64 = pdf.output('datauristring').split(',')[1];
      }
    }
    const body = {
      jsonBody: data,
      url: details.url,
      fileContentB64: fileContentB64
        ? [
            {
              fileContentB64: fileContentB64,
              type: 'resumeAttachment',
              responseHeaders: fileResp.headers,
            },
          ]
        : null,
    };
    return { details, body };
  })
);

// 以下请求会缓存header 不含预检请求
const cacheHeaders$ =
  RequestListen.installOnBeforeSendHeaders(needCacheHeadersUrl);
cacheHeaders$
  .pipe(
    filter(details => details.tabId !== -1 && details.method !== 'OPTIONS'),
    tap(details => {
      console.log('step 1 cacheHeaders details', details);
    })
  )
  .subscribe(async details => {
    requestsHeaderMap.set(details.requestId, {
      url: details.url,
      method: details.method,
      timeStamp: details.timeStamp,
      headers: details.requestHeaders,
    });
  });
// 这个是重放器，配置的URL会执行重放
const resumeSendHeadersV2Base$ = RequestListen.installOnBeforeRequest(
  needCacheHeadersUrl
).pipe(
  filter(details => details.tabId !== -1 && details.method !== 'OPTIONS'),
  tap(details => {
    console.log('step 2.0 cacheHeaders details', details);
  }),
  mergeMap(async details => {
    // 必须的延迟，否则会出错
    await delay(2000);
    const originalHeaders =
      requestsHeaderMap.get(details.requestId)?.headers ?? {};
    if (!originalHeaders) {
      console.log('step 2 cacheHeaders cant find headers', originalHeaders);
    }
    const headers = {};
    for (const key in originalHeaders) {
      if (
        originalHeaders.hasOwnProperty(key) &&
        originalHeaders[key] &&
        originalHeaders[key].name
      ) {
        const headerName = originalHeaders[key].name;
        headers[headerName] = originalHeaders[key].value;
      }
    }
    const contentType = headers['Content-Type'] || '';
    let requestBody;
    if (contentType.includes('application/x-www-form-urlencoded')) {
      if (details?.requestBody?.formData) {
        const formData = details.requestBody.formData;
        const urlSearchParams = new URLSearchParams();
        for (const key in formData) {
          if (formData.hasOwnProperty(key)) {
            const values = formData[key];
            if (Array.isArray(values)) {
              values.forEach(value => {
                urlSearchParams.append(key, value);
              });
            }
          }
        }
        requestBody = urlSearchParams.toString();
      } else if (
        details?.requestBody?.raw &&
        details.requestBody.raw.length > 0
      ) {
        const rawBytes = details.requestBody.raw[0].bytes;
        requestBody = new TextDecoder().decode(rawBytes);
      }
    } else if (contentType.includes('multipart/form-data')) {
      if (details?.requestBody?.raw && details.requestBody.raw.length > 0) {
        const rawBytes = details.requestBody.raw[0].bytes;
        requestBody = rawBytes;
      }
    } else if (contentType.includes('application/json')) {
      if (details?.requestBody?.raw && details.requestBody.raw.length > 0) {
        const rawBytes = details.requestBody.raw[0].bytes;
        requestBody = new TextDecoder().decode(rawBytes); // 保持JSON字符串格式
      }
    } else if (
      details?.requestBody?.raw &&
      details.requestBody.raw.length > 0
    ) {
      const rawBytes = details.requestBody.raw[0].bytes;
      requestBody = new TextDecoder().decode(rawBytes);
    }

    const opt = {
      method: details.method,
      headers: headers,
      body: requestBody,
    };

    if (
      contentType.includes('multipart/form-data') &&
      requestBody instanceof Uint8Array
    ) {
      opt.body = new Blob([requestBody]);
    }
    const _replayResponse = await request(details.url, opt);
    const replayResponse = await _replayResponse.json();
    return { details, replayResponse, headers };
  }),
  tap(result => {
    console.log('重放器执行重放完成', result);
  }),
  share()
);

// 智联招聘简历附件处理流
const zhilianAttachmentResume$ = resumeSendHeadersV2Base$.pipe(
  map(response => {
    const { details, replayResponse, headers } = response;
    return { details, replayResponse, headers };
  }),
  filter(({ details }) =>
    details.url.includes('rd6.zhaopin.com/api/resume/detail')
  ),
  mergeMap(async ({ details, replayResponse, headers }) => {
    try {
      const url = new URL(details.url);
      const resumeId = url.searchParams.get('_');
      let requestBodyObj = {};
      const rawBytes = details.requestBody.raw[0].bytes;
      const requestBodyText = new TextDecoder().decode(rawBytes);
      requestBodyObj = JSON.parse(requestBodyText);
      const requestBody = {
        jobNumber: requestBodyObj.jobNumber,
        resumeNumber: requestBodyObj.resumeNumber,
        language: 1,
      };
      // 这个接口用来拿附件的url
      const attachmentUrl = `https://rd6.zhaopin.com/api/resume/getAttachResumeUrl?_=${resumeId}`;
      const attachResponse = await request(attachmentUrl, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      const attachData = await attachResponse.json();
      const fileUrl = attachData?.data;
      let fileContentB64 = null;
      if (fileUrl) {
        // 下载附件
        const fileResponse = await request(fileUrl, {
          method: 'GET',
        });
        const blob = await fileResponse.blob();
        const underFileContentB64 = await new Promise(resolve => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            resolve(reader.result.split(',')[1]);
          };
        });
        const responseHeaders = {};
        fileResponse.headers.forEach((value, name) => {
          responseHeaders[name] = value;
        });
        fileContentB64 = {
          fileContentB64: underFileContentB64,
          responseHeaders: responseHeaders,
          type: 'resumeAttachment',
        };
      }
      const body = {
        jsonBody: replayResponse,
        url: details.url,
        fileContentB64: fileContentB64 ? [fileContentB64] : [],
      };
      return {
        details,
        headers,
        body,
      };
    } catch (error) {
      console.error('处理智联简历附件时出错:', error);
      const body = {
        jsonBody: replayResponse,
        url: details.url,
        fileContentB64: [],
      };
      return {
        details,
        headers,
        body,
      };
    }
  })
);
const resumeSendHeadersV2BaseSub$ = resumeSendHeadersV2Base$.pipe(
  tap(({ details }) => {
    console.log('resumeSendHeadersV2BaseSub$', details);
  }),
  filter(({ details }) => {
    // 如果命中了 needCacheHeadersUrlSubStream里面的url就继续执行
    return needCacheHeadersUrlSubStream.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(details.url);
    });
  }),
  mergeMap(async ({ details, replayResponse }) => {
    const body = {
      jsonBody: replayResponse,
      url: details.url,
      fileContentB64: [],
    };
    const headers = {};
    return { details, headers, body };
  })
);

// 领英企业账户搜索页-获取联系方式
const linkedInContactResume$ = resumeSendHeadersV2Base$.pipe(
  map(response => {
    const { details, replayResponse, headers } = response;
    return { details, replayResponse, headers };
  }),
  filter(({ details }) => {
    return details.url.includes(
      'www.linkedin.com/talent/api/talentLinkedInMemberProfiles'
    );
  }),
  filter(({ details }) => {
    console.log('step 2.3 cacheHeaders details', details);
    // 实际上领英获取一次简历会调用三次这个接口，这里过滤掉取一个
    const isLinkedInProfileUrl = details.url.includes(
      'www.linkedin.com/talent/api/talentLinkedInMemberProfiles'
    );
    const hasContract = details.url.includes('ts_contract');
    const urlObj = new URL(details.url);
    const hasParamsParam = urlObj.searchParams.has('params');
    console.log(
      'hasParamsParam',
      hasParamsParam,
      isLinkedInProfileUrl,
      hasContract,
      details.url
    );
    return isLinkedInProfileUrl && !hasParamsParam && hasContract;
  }),
  mergeMap(async ({ details, replayResponse, headers }) => {
    const csrfToken = headers['Csrf-Token'];
    let match;
    let profileId;
    let decodedUrl = decodeURIComponent(details.url);
    match = decodedUrl.match(/urn:li:ts_linkedin_member_profile:\(([^,]+)/);
    if (match && match[1]) {
      profileId = match[1];
    }
    let contractId1;
    let contractId2;
    match = decodedUrl.match(/\(urn:li:ts_contract:(\d+),(\d+)\)/);
    if (match && match[1] && match[2]) {
      contractId1 = match[1];
      contractId2 = match[2];
    }

    const contactInfoUrl = `https://www.linkedin.com/talent/api/talentHiringProjectRecruitingProfiles/urn%3Ali%3Ats_hiring_project_candidate%3A(urn%3Ali%3Ats_contract%3A${contractId1}%2Curn%3Ali%3Ats_profile%3A${profileId}%2Curn%3Ali%3Ats_hiring_project%3A(urn%3Ali%3Ats_contract%3A${contractId1}%2C${contractId2}))?altkey=urn&decoration=%28contactInfo%28emails%2Cphones*%2CprimaryPhone%2CprimaryEmail%29%29`;
    // 请求联系方式
    let data = { ...replayResponse };
    try {
      const contactInfoResponse = await request(contactInfoUrl, {
        method: 'GET',
        headers: {
          'Csrf-Token': csrfToken,
          'x-li-lang': 'zh_CN',
          'x-restli-protocol-version': '2.0.0',
        },
      });
      const contactInfoData = await contactInfoResponse.json();
      const contactInfo = contactInfoData?.data?.contactInfo || {};
      console.log('获取到领英联系方式:', contactInfo);
      data = { ...replayResponse, ...contactInfo };
    } catch (error) {
      console.error('处理领英联系方式时出错:', error);
    }
    const body = {
      // 因为合并了联系方式，所以这里需要传入data
      jsonBody: data,
      url: details.url,
      fileContentB64: [],
    };
    return { details, headers, body };
  })
);

const htmlSync$ = message$.pipe(
  filter(isSyncHtmlMessage),
  withLatestFrom(user$),
  tap(message => {
    console.log('htmlSync$ recieved: ', message);
  }),
  mergeMap(async ([message, user]) => {
    const url = message.message.payload.url;
    const tabId = message.sender.tab.id;
    const details = {
      url,
      tabId,
      html: message.message.payload.html,
    };
    const headers = {};
    const body = {};

    return { details, headers, body };
  })
);

// 简历流聚合
const mergedResume$ = merge(
  // 领英: 简历流 json含联系方式
  linkedInContactResume$,
  // 拉勾: 招人、简历库简历流 含附件
  lagouOrderResume$,
  // 拉勾: 沟通页面简历流 含附件
  lagouCommunicationLastResume$,
  // 智联: 简历流 含附件
  zhilianAttachmentResume$,
  // 脉脉: 简历流 含附件
  maimaiResumeLast$,
  // 多猎: 实习僧:  无附件
  resumeSendHeadersV2BaseSub$,
  // html采集
  htmlSync$
);
mergedResume$
  .pipe(
    tap(({ details }) => {
      console.log('mergedResume$ details', details);
    }),
    withLatestFrom(user$),
    filter(([_, user]) => !!user),
    tap(([data, user]) => {
      console.log('the last mergedResume data', data);
    }),
    mergeMap(([data, user]) => {
      const { details, headers, body } = data;
      const requestId = uuid();
      const syncResumeStartMessage = {
        requestId: requestId,
        type: 'sync-resume-start',
        payload: {
          type: 'other',
        },
      };
      // 返回一个 Observable，确保 mergeMap 有正确的返回值
      return from(
        browser.tabs.sendMessage(details.tabId, syncResumeStartMessage)
      ).pipe(
        map(() => ({ data, user })) // 保持原始数据流向下一个操作符
      );
    }),
    mergeMap(async ({ data, user }) => {
      const requestId = uuid();
      // 等待用户确认
      const confirmed = await waitForSyncMessage(
        data.details.tabId,
        tabsObject,
        wait,
        requestId
      );
      // 返回原始数据和确认结果
      return { data, user, confirmed };
    }),
    filter(({ confirmed }) => confirmed),
    mergeMap(async ({ data, user }) => {
      const { details, headers, body } = data;
      const bodyUrl = details.url;
      const rawBytes = details?.requestBody?.raw?.[0]?.bytes;
      let _requestBody = null;
      if (rawBytes) {
        const requestBodyText = new TextDecoder().decode(rawBytes);
        try {
          _requestBody = JSON.parse(requestBodyText);
        } catch (error) {
          console.error('parse json error:', error);
          _requestBody = { raw: requestBodyText };
        }
      }
      const requestBody = {
        html: details?.html,
        jsonBody: body?.jsonBody,
        // 坑：领英不是json解不出来
        requestBody: _requestBody,
        requestHeaders: headers,
        requestUrl: bodyUrl,
        fileContentB64: body.fileContentB64,
      };
      const syncEntityResponse = await request(
        EntityExecuteHost + '/v1/sync-entity/all',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + user.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );
      const syncResumeFeedbackMsg = {
        requestId: uuid(),
        type: 'sync-resume-feedback',
        payload: {
          isSyncResumeError: false,
        },
      };
      const syncEntityResponseData = await syncEntityResponse.json();
      const { openId, entityType, tenantId } = syncEntityResponseData.data;
      await waitForResumeSyncResult(
        details.tabId,
        openId,
        entityType,
        user,
        syncEntityResultCheckUrl
      );
      syncResumeFeedbackMsg.payload.openId = openId;
      syncResumeFeedbackMsg.payload.tenant = tenantId;
      browser.tabs.sendMessage(details.tabId, syncResumeFeedbackMsg);
      return { syncEntityResponse, openId, entityType, tenantId };
    }),
    share()
  )
  .subscribe();

message$
  .pipe(filter(isConfirmSynchronizationMessage), withLatestFrom(user$))
  .subscribe(async ([message]) => {
    console.log('isConfirmSynchronizationMessage recieved: ', message);
    const tabId = message.message.requestId || message.sender.tab.id;
    tabsObject[tabId] = 1;
  });
