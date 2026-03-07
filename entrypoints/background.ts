const SMARTEXCEL_URL = 'https://smarterexcel.com';
const PLUGIN_PAYMENT_URL = `${SMARTEXCEL_URL}/plugin-payment?closeAfterPayment=true`;

// ─── Credit helpers ────────────────────────────────────────────────────────

async function getFreeUsed(): Promise<number> {
  const result = await browser.storage.local.get('se_free_used');
  return (result.se_free_used as number) || 0;
}

async function getStoredCredits(): Promise<{
  credits: number;
  loggedIn: boolean;
}> {
  const result = await browser.storage.local.get(['se_credits', 'se_logged_in']);
  return {
    credits: (result.se_credits as number) || 0,
    loggedIn: (result.se_logged_in as boolean) || false,
  };
}

/**
 * Check if user can export and consume one credit.
 */
async function checkAndConsume(): Promise<{
  allowed: boolean;
  remaining?: number;
  isLoggedIn: boolean;
  reason?: string;
}> {
  const { credits, loggedIn } = await getStoredCredits();

  if (loggedIn) {
    if (credits > 0) {
      const newCredits = credits - 1;
      await browser.storage.local.set({ se_credits: newCredits });
      return { allowed: true, remaining: newCredits, isLoggedIn: true };
    }
    return { allowed: false, reason: 'no_credits', isLoggedIn: true };
  }

  // Not logged in: use 3-free local limit
  const freeUsed = await getFreeUsed();
  const FREE_LIMIT = 3;
  if (freeUsed < FREE_LIMIT) {
    await browser.storage.local.set({ se_free_used: freeUsed + 1 });
    return { allowed: true, remaining: FREE_LIMIT - freeUsed - 1, isLoggedIn: false };
  }
  return { allowed: false, reason: 'free_limit_reached', isLoggedIn: false };
}

async function syncCredits(data: {
  credits: number;
  loggedIn: boolean;
  email?: string;
  name?: string;
}): Promise<void> {
  await browser.storage.local.set({
    se_credits: data.credits,
    se_logged_in: data.loggedIn,
    se_email: data.email ?? '',
    se_name: data.name ?? '',
  });
}

// ─── Main background entry ─────────────────────────────────────────────────

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'OPEN_WEBSITE') {
      const url = message.payload?.tableId
        ? `${SMARTEXCEL_URL}/import?source=extension&tableId=${message.payload.tableId}`
        : SMARTEXCEL_URL;
      browser.tabs.create({ url });
      return false;
    }

    if (message.type === 'OPEN_PAYMENT_PAGE') {
      const planId = message.payload?.planId;
      const url = planId
        ? `${PLUGIN_PAYMENT_URL}&planId=${planId}`
        : PLUGIN_PAYMENT_URL;
      browser.tabs.create({ url });
      return false;
    }

    // Check and consume one export credit (async)
    if (message.type === 'CHECK_AND_CONSUME') {
      checkAndConsume().then(sendResponse);
      return true; // keep channel open for async response
    }

    // Sync credits from plugin-payment page via postMessage relay
    if (message.type === 'PLUGIN_SYNC') {
      syncCredits(message.data).then(() => sendResponse({ ok: true }));
      return true;
    }

    // Get current credit state (for popup display)
    if (message.type === 'GET_STATE') {
      getStoredCredits().then(async (state) => {
        const freeUsed = await getFreeUsed();
        sendResponse({ ...state, freeUsed, freeLimit: 3 });
      });
      return true;
    }

    return false;
  });

  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
    }
  });
});
