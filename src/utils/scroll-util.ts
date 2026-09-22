// 滚动相关工具：自动探测可滚动容器并等待滚动稳定
// 供 content 脚本复用（broswer-use.js / syncReceiveResumeUtil.ts）

export function isScrollableContainer(el: Element): boolean {
  if (!el || el === document.body || el === document.documentElement)
    return false;
  const style = window.getComputedStyle(el);
  const overflowY = style.overflowY;
  const scrollableY =
    overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
  if (!scrollableY) return false;
  return el.scrollHeight > el.clientHeight + 5;
}

export function pickBestScrollableContainer(): Element | null {
  const all = Array.from(document.querySelectorAll('*'));
  let best: Element | null = null;
  let bestDistance = 0;
  for (const el of all) {
    if (!isScrollableContainer(el)) continue;
    const distance = el.scrollHeight - el.clientHeight;
    if (distance > bestDistance) {
      best = el;
      bestDistance = distance;
    }
  }
  return best;
}

export async function waitScrollStable(
  getTop: () => number,
  maxWaitMs = 1500
): Promise<void> {
  const start = Date.now();
  let stableCount = 0;
  let lastTop = getTop();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const top = getTop();
    if (top === lastTop) {
      stableCount++;
    } else {
      stableCount = 0;
      lastTop = top;
    }
    if (stableCount >= 6) return;
  }
}
