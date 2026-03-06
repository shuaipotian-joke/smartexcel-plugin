export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_WEBSITE') {
      const baseUrl = 'https://smartexcel.app';
      const url = message.payload?.tableId
        ? `${baseUrl}/import?source=extension&tableId=${message.payload.tableId}`
        : baseUrl;
      browser.tabs.create({ url });
    }
    return false;
  });

  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
    }
  });
});
