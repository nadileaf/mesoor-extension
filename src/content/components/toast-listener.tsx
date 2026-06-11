import { useEffect } from 'react';
import browser from 'webextension-polyfill';
import { useToast } from './use-toast';

export function ToastListener() {
  const { addToast } = useToast();

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = (msg: any) => {
      if (msg?.type === 'show-toast') {
        addToast({
          title: msg.title,
          message: msg.message || '',
          type: msg.toastType || 'info',
          duration: msg.duration !== undefined ? msg.duration : 4000,
        });
      }
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [addToast]);

  return null;
}
