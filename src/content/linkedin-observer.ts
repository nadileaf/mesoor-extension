// 领英个人主页懒加载打桩：document_start + world=MAIN，在页面脚本之前执行。
// 领英用 IntersectionObserver 判定区块是否进入视口来懒渲染；把该判定打桩为恒真，
// 即可在不滚动页面的情况下让全部区块渲染出来，供 sync-html 采集完整 HTML。

(() => {
  if (!window.IntersectionObserver) return;

  class IntersectionObserverShim {
    root: Element | Document | null;
    rootMargin: string;
    thresholds: ReadonlyArray<number>;
    private _cb: IntersectionObserverCallback;
    private _els = new Set<Element>();

    constructor(
      cb: IntersectionObserverCallback,
      options?: IntersectionObserverInit
    ) {
      this._cb = cb;
      this.root = options?.root ?? null;
      this.rootMargin = options?.rootMargin ?? '0px';
      const threshold = options?.threshold;
      this.thresholds =
        threshold == null ? [0] : ([] as number[]).concat(threshold);
    }

    observe(el: Element): void {
      this._els.add(el);
      // 异步上报一次「已进入视口」，模拟真实进入
      setTimeout(() => {
        if (!this._els.has(el)) return;
        let rect: DOMRect;
        try {
          rect = el.getBoundingClientRect();
        } catch {
          return;
        }
        const entry = {
          target: el,
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: rect,
          intersectionRect: rect,
          rootBounds: null,
          time: performance.now(),
        } as IntersectionObserverEntry;
        try {
          this._cb([entry], this as unknown as IntersectionObserver);
        } catch {
          // ignore
        }
      }, 50);
    }

    unobserve(el: Element): void {
      this._els.delete(el);
    }

    disconnect(): void {
      this._els.clear();
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  window.IntersectionObserver =
    IntersectionObserverShim as unknown as typeof IntersectionObserver;
  console.log(
    '[LinkedInObserver] IntersectionObserver 已打桩（懒加载恒视为进入视口）'
  );
})();
