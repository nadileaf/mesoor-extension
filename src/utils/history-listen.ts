import browser from 'webextension-polyfill';
import { fromEventPattern } from 'rxjs';

export function installHistoryListener() {
  const onHistoryStateUpdated = browser.webNavigation.onHistoryStateUpdated;
  return fromEventPattern(
    handler => {
      onHistoryStateUpdated.addListener(handler);
      return handler;
    },
    handler => {
      onHistoryStateUpdated.removeListener(handler);
    }
  );
}
