import browser from "webextension-polyfill";

export const isTabIdExists = async (tabId: number): Promise<boolean> => {
  const allTabs = await browser.tabs.query({});
  for (let tab of allTabs) {
    if (tab.id === tabId) {
      return true;
    }
  }
  return false;
};
