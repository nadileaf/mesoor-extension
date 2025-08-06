import browser from 'webextension-polyfill';
import { fromEventPattern, Observable, of } from 'rxjs';
import { filter, share } from 'rxjs/operators';
import { SyncStorage, LocalStorage } from '../interfaces/storage.ts';
import { StorageChange } from '../interfaces/storage-change.ts';

// 检查是否在有效的扩展环境中
function isValidExtensionContext(): boolean {
  try {
    return !!(browser && browser.storage && browser.storage.onChanged);
  } catch (e) {
    return false;
  }
}

// 安全地创建storage变化流
let storageChange$: Observable<
  [StorageChange<SyncStorage | LocalStorage>, string]
>;

try {
  console.log('browser', browser);
  // 确保browser.storage和onChanged存在
  if (isValidExtensionContext()) {
    const onChanged = browser.storage.onChanged;

    storageChange$ = fromEventPattern<
      [StorageChange<SyncStorage | LocalStorage>, string]
    >(
      onChanged.addListener.bind(onChanged),
      onChanged.removeListener.bind(onChanged),
      (change, area) => [change, area]
    ).pipe(share());

    console.log('成功初始化storage变化监听');
  } else {
    console.warn('browser.storage.onChanged不可用，使用空Observable替代');
    storageChange$ = of() as Observable<
      [StorageChange<SyncStorage | LocalStorage>, string]
    >;
  }
} catch (error) {
  console.error('初始化storage变化监听时出错:', error);
  storageChange$ = of() as Observable<
    [StorageChange<SyncStorage | LocalStorage>, string]
  >;
}

// 安全的存储访问函数
export async function safeStorageGet(
  area: 'sync' | 'local',
  key: string
): Promise<any> {
  try {
    if (!isValidExtensionContext()) {
      console.warn(
        `Storage API not available in this context, cannot get ${key}`
      );
      return {};
    }

    const storage =
      area === 'sync' ? browser.storage.sync : browser.storage.local;
    return await storage.get(key);
  } catch (error) {
    console.error(`Error accessing ${area} storage for key ${key}:`, error);
    return {};
  }
}

export const syncstorageChange$ = storageChange$.pipe(filter(isSyncStorage));

export const localstorageChange$ = storageChange$.pipe(filter(isLocalStorage));

function isSyncStorage(
  arg: [{}, string]
): arg is [StorageChange<SyncStorage>, string] {
  return arg[1] === 'sync';
}

function isLocalStorage(
  arg: [{}, string]
): arg is [StorageChange<LocalStorage>, string] {
  return arg[1] === 'local';
}
