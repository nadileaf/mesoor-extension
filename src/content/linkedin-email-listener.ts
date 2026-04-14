import browser from 'webextension-polyfill';
import { v4 as uuid } from 'uuid';
import './views/linkedin-email-confirm';
import './views/linkedin-email-dialog';

// LinkedIn Recruiter 页面 URL 模式
const LINKEDIN_PATTERNS = {
  search: /^https:\/\/www\.linkedin\.com\/talent\/search/,
  recruiterSearch:
    /^https:\/\/www\.linkedin\.com\/talent\/hire\/\d+\/discover\/recruiterSearch/,
  profile: /^https:\/\/www\.linkedin\.com\/talent\/profile/,
};

// 按钮选择器
const BUTTON_SELECTOR =
  '.shared-action-buttons .profile-item-actions__update button .artdeco-button__icon';
const PROFILE_CONTAINER_SELECTOR = '.profile-list__border-bottom';
const PROFILE_LINK_SELECTOR = 'a[href*="/profile/"]';

// 检查当前页面是否为 LinkedIn Recruiter 页面
function isLinkedInRecruiterPage(): boolean {
  const url = window.location.href;
  return (
    LINKEDIN_PATTERNS.search.test(url) ||
    LINKEDIN_PATTERNS.recruiterSearch.test(url) ||
    LINKEDIN_PATTERNS.profile.test(url)
  );
}

// 发送邮件生成消息
async function sendEmailGenerateMessage(profileLink: string | null) {
  // 立即显示弹窗并设置为 loading 状态
  const generatingEvent = new CustomEvent('linkedin-email-generating');
  window.dispatchEvent(generatingEvent);
  console.log('[LinkedIn Email] 已触发弹窗显示 loading 状态');

  const message = {
    requestId: uuid(),
    type: 'linkedin-email-generate',
    payload: {
      url: profileLink || window.location.href,
      company: '',
      jobdesc: '',
      consultant: '',
      tone: '专业礼貌',
      confidential: '保密，不透露',
    },
  };

  console.log('[LinkedIn Email] 发送邮件生成消息:', message);
  await browser.runtime.sendMessage(message);
}

// 显示确认对话框
function showConfirmDialog(profileLink: string | null) {
  // 触发确认对话框显示
  const event = new CustomEvent('linkedin-email-confirm', {
    detail: { profileLink },
  });
  window.dispatchEvent(event);
}

// 按钮点击处理函数
async function handleButtonClick(event: Event) {
  try {
    const clickedButton = event.currentTarget as Element;

    // 获取 profile link
    const profileContainer = clickedButton.closest(PROFILE_CONTAINER_SELECTOR);
    let profileLink: string | null = null;

    if (profileContainer) {
      const linkElement = profileContainer.querySelector(PROFILE_LINK_SELECTOR);
      if (linkElement) {
        profileLink = linkElement.getAttribute('href');
      }
    }

    console.log('[LinkedIn Email] 按钮被点击');
    console.log('[LinkedIn Email] Profile link:', profileLink || 'Not found');
    console.log('[LinkedIn Email] 当前页面:', window.location.href);

    // 检查开关状态
    const result = await browser.storage.sync.get('linkedInEmailWait');
    const needConfirm =
      (result.linkedInEmailWait as { isEmailWait?: boolean })?.isEmailWait ||
      false;

    if (needConfirm) {
      // 显示确认弹窗
      console.log('[LinkedIn Email] 显示确认对话框');
      showConfirmDialog(profileLink);
    } else {
      // 直接发送消息生成邮件
      console.log('[LinkedIn Email] 自动生成邮件');
      await sendEmailGenerateMessage(profileLink);
    }
  } catch (error) {
    console.error('[LinkedIn Email] 处理按钮点击时出错:', error);
  }
}

// 为按钮添加事件监听器
function attachEventListener(button: Element) {
  if (!button.hasAttribute('data-linkedin-email-listener')) {
    button.setAttribute('data-linkedin-email-listener', 'true');
    button.addEventListener('click', handleButtonClick);
    console.log('[LinkedIn Email] 已为按钮添加监听器');
  }
}

// 观察目标元素
function observeTargetElement() {
  if (!isLinkedInRecruiterPage()) {
    console.log('[LinkedIn Email] 当前页面不是 LinkedIn Recruiter 页面');
    return;
  }

  console.log('[LinkedIn Email] 初始化 LinkedIn 邮件监听器');

  // 创建 MutationObserver 监听 DOM 变化
  const mutationObserver = new MutationObserver(() => {
    const buttons = document.querySelectorAll(BUTTON_SELECTOR);
    buttons.forEach(button => {
      attachEventListener(button);
    });
  });

  // 配置观察选项
  const config: MutationObserverInit = {
    childList: true,
    subtree: true,
  };

  // 开始观察
  mutationObserver.observe(document.body, config);

  // 检查初始状态的按钮
  const initialButtons = document.querySelectorAll(BUTTON_SELECTOR);
  console.log('[LinkedIn Email] 找到初始按钮数量:', initialButtons.length);
  initialButtons.forEach(button => {
    attachEventListener(button);
  });
}

// 监听 URL 变化
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('[LinkedIn Email] URL 变化，重新初始化');
    observeTargetElement();
  }
});

// 初始化
(() => {
  console.log('[LinkedIn Email] LinkedIn 邮件监听器脚本已加载');
  observeTargetElement();

  // 监听 URL 变化
  urlObserver.observe(document, { subtree: true, childList: true });

  // 监听来自确认对话框的确认消息
  window.addEventListener('linkedin-email-confirmed', async (event: Event) => {
    const customEvent = event as CustomEvent;
    const { profileLink } = customEvent.detail;
    console.log('[LinkedIn Email] 用户确认生成邮件');
    await sendEmailGenerateMessage(profileLink);
  });
})();
