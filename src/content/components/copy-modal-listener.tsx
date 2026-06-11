import { useEffect } from 'react';
import browser from 'webextension-polyfill';
import { useCopyModal } from './use-copy-modal';

export function CopyModalListener() {
  const { openModal } = useCopyModal();

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = (msg: any) => {
      if (msg?.type === 'show-copy-modal') {
        openModal({
          title: msg.title || '复制内容',
          content: msg.content || '',
        });
      }
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [openModal]);

  return null;
}
