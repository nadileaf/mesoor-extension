import { isTabIdExists } from './tabCheck';
import { from, interval } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { delay } from './index';

// 抓取HTML简历

const LINKEDIN_PROFILE_RE = /linkedin\.com\/in\//i;

function isLinkedInProfilePage(): boolean {
  return LINKEDIN_PROFILE_RE.test(document.location.href);
}

// 领英个人主页是异步渲染：等 <main> 里出现区块再继续
async function waitForLinkedInReady(timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (document.querySelector('main section')) return;
    await delay(300);
  }
}

// 等区块数量稳定（懒加载渲染完成后）再采集
async function waitForLinkedInSectionsStable(
  timeoutMs = 15000,
  stableMs = 2000
): Promise<void> {
  const start = Date.now();
  let lastCount = -1;
  let lastChange = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = document.querySelectorAll('main section').length;
    if (count !== lastCount) {
      lastCount = count;
      lastChange = Date.now();
    } else if (Date.now() - lastChange >= stableMs) {
      return;
    }
    await delay(300);
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
    // 领英懒加载已由 MAIN world 的 IntersectionObserver 打桩触发（无需滚动）：
    // 等主内容就绪 -> 等区块数量稳定 -> 采集
    await waitForLinkedInReady();
    await waitForLinkedInSectionsStable();
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
