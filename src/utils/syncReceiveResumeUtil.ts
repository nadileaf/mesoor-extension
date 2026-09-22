import { isTabIdExists } from './tabCheck';
import { from, interval } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { delay } from './index';
import { pickBestScrollableContainer, waitScrollStable } from './scroll-util';

// 抓取HTML简历

const LINKEDIN_PROFILE_RE = /linkedin\.com\/in\//i;

function isLinkedInProfilePage(): boolean {
  return LINKEDIN_PROFILE_RE.test(document.location.href);
}

// 领英个人主页是异步渲染：等 <main> 里出现区块再开始滚动，避免滚到空容器
async function waitForLinkedInReady(timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (document.querySelector('main section')) return;
    await delay(300);
  }
}

// 展开「… 更多 / see more」折叠文本；只点正文展开按钮，不点操作菜单「更多」
function expandLinkedInSeeMore(): number {
  const buttons = Array.from(
    document.querySelectorAll<HTMLElement>('main button')
  ).filter(btn => {
    const text = (btn.innerText || '').trim();
    const aria = btn.getAttribute('aria-label') || '';
    return text.startsWith('…') || /see more|show more/i.test(aria);
  });
  buttons.forEach(btn => {
    try {
      btn.click();
    } catch {
      // ignore
    }
  });
  return buttons.length;
}

// 领英主页滚动容器是 <main>（overflow:scroll），必须滚容器而非 window
async function autoScrollLinkedIn(
  maxIterations = 30,
  stepDelayMs = 600
): Promise<void> {
  const container = pickBestScrollableContainer();
  const scrollingElement =
    document.scrollingElement || document.documentElement;
  const isContainer = !!container;

  const getTop = () =>
    isContainer ? (container as Element).scrollTop : window.scrollY;
  const getScrollHeight = () =>
    isContainer
      ? (container as Element).scrollHeight
      : document.documentElement.scrollHeight || document.body.scrollHeight;
  const getClientHeight = () =>
    isContainer ? (container as Element).clientHeight : window.innerHeight;

  const scrollToBottom = () => {
    const top = Math.max(0, getScrollHeight() - getClientHeight());
    if (isContainer) {
      (container as Element).scrollTo({ top, behavior: 'auto' });
    } else {
      scrollingElement.scrollTo({ top, behavior: 'auto' });
    }
  };

  let lastHeight = 0;
  let stableRounds = 0;
  for (let i = 0; i < maxIterations; i++) {
    scrollToBottom();
    await waitScrollStable(getTop, stepDelayMs);
    const height = getScrollHeight();
    if (height === lastHeight) {
      stableRounds++;
      if (stableRounds >= 3) break;
    } else {
      stableRounds = 0;
      lastHeight = height;
    }
    await delay(stepDelayMs);
  }
}

function scrollLinkedInToTop(): void {
  const container = pickBestScrollableContainer();
  if (container) {
    (container as Element).scrollTo({ top: 0, behavior: 'auto' });
  } else {
    (document.scrollingElement || document.documentElement).scrollTo({
      top: 0,
      behavior: 'auto',
    });
  }
}

// 把HTML里面的图片元素后面插入一段其转成的base64
function insertBase64(
  html: string,
  img: HTMLImageElement,
  addFlag: boolean,
  isPhone: boolean
): string {
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d')!;
  ctx.canvas.height = img.height;
  ctx.canvas.width = img.width;
  ctx.drawImage(img, 0, 0, img.width, img.height);
  const imgStr = img.outerHTML;
  const prefix = html.substring(0, html.indexOf(imgStr) + imgStr.length);
  const suffix = html.substring(html.indexOf(imgStr) + imgStr.length);
  const base64 = canvas.toDataURL();
  const mid = base64.substr(base64.indexOf(',') + 1);
  const insertMid = addFlag
    ? `<span hidden>${isPhone ? '手机：' : '邮箱：'}${mid}</span>`
    : mid;
  console.log('syncReceiveResume: base64 ', base64);
  console.log('syncReceiveResume: base64 sub ', mid);
  return prefix + insertMid + suffix;
}
// 猎聘猎头的图片联系方式
function liepinHeadhunterContect(html: string): string {
  let telphone, email;

  // 手机号的抓取
  telphone = document.querySelector<HTMLImageElement>('img.telphone');
  if (telphone) {
    // 老版的 liepin 界面，能够根据 img.telphone 选择出手机号码图片
    html = insertBase64(html, telphone, false, false);
  } else {
    // 新版的 liepin 界面，只能根据 img.connect-img 选择出联系方式图片
    // 然后再根据 sibling 上的 i 来判断是手机号还是邮箱
    document
      .querySelectorAll<HTMLImageElement>('img.connect-img')
      .forEach(ele => {
        if (
          ele &&
          ele.getAttribute('src') &&
          /type=0/.test(ele.getAttribute('src')!)
        ) {
          // 由于图片 img 上的 src 属性在手机号和邮箱上是不同的
          html = insertBase64(html, ele, true, true);
        }
      });
  }
  // 邮箱的抓取
  email = document.querySelector<HTMLImageElement>('img.email');
  if (email) {
    html = insertBase64(html, email, false, false);
  } else {
    document
      .querySelectorAll<HTMLImageElement>('img.connect-img')
      .forEach(ele => {
        if (
          ele &&
          ele.getAttribute('src') &&
          /type=1/.test(ele.getAttribute('src')!)
        ) {
          html = insertBase64(html, ele, true, false);
        }
      });
  }
  // logger.log('syncReceiveResume: liepinheadhunter html', html)
  return html;
}

// 抓取并处理的HTML文本
export async function processHTML(): Promise<string> {
  let html = document.documentElement!.outerHTML;
  if (
    !!document.location.href.includes('h.liepin.com/resume/showresumedetail')
  ) {
    // 点击「显示其他项目经历」按钮
    const button = document.querySelector<HTMLElement>(
      'span.rd-info-other-link'
    );
    if (button) {
      button.click();
      await delay(200);
      // 这里要重新获取 html
      html = liepinHeadhunterContect(document.documentElement!.outerHTML);
      await delay(100);
      // 延迟100ms后滚动到最上面
      window.scrollTo(0, 0);
    } else {
      html = liepinHeadhunterContect(html);
    }
  } else if (isLinkedInProfilePage()) {
    // 领英异步渲染：等就绪 -> 展开折叠文本 -> 滚动触发懒加载 -> 再展开 -> 回顶
    await waitForLinkedInReady();
    expandLinkedInSeeMore();
    await autoScrollLinkedIn();
    expandLinkedInSeeMore();
    await delay(300);
    scrollLinkedInToTop();
    await delay(100);
    html = document.documentElement.outerHTML;
  }
  return html;
}

export const waitForSyncMessage = async (
  tabId: number,
  tabsObject: { [key: string | number]: any },
  wait: boolean = true,
  requestId: string | undefined = undefined
): Promise<boolean> => {
  if (wait) {
    const queryId: string | number = requestId || tabId;
    return (await new Promise(resolve => {
      const interval$ = interval(200)
        .pipe(
          switchMap(_ => from(isTabIdExists(tabId))),
          filter(isExist => queryId in tabsObject || !isExist)
        )
        .subscribe(isExist => {
          interval$.unsubscribe();
          delete tabsObject[queryId];
          resolve(isExist);
        });
    })) as boolean;
  }
  return true;
};
