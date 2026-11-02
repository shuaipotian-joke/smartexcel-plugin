import { TRIAL_EXPORTS } from '@/utils/constants';

const SMARTEXCEL_URL =
  import.meta.env.WXT_SMARTEXCEL_URL || 'http://localhost:3000';
const PLUGIN_BRIDGE_URL = `${SMARTEXCEL_URL}/plugin-auth/bridge`;
const PLUGIN_ME_URL = `${SMARTEXCEL_URL}/api/plugin/auth/me`;
const PLUGIN_ACCESS_URL = `${SMARTEXCEL_URL}/api/plugin/access`;
const PLUGIN_CREATE_LOGIN_TICKET_URL = `${SMARTEXCEL_URL}/api/plugin/auth/create-login-ticket`;
const PLUGIN_REVOKE_URL = `${SMARTEXCEL_URL}/api/plugin/auth/revoke`;
const CONTENT_SCRIPT_PATH = 'content-scripts/content.js';
const CONTEXT_MENU_ROOT_ID = 'smartexcel-context-root';
const CONTEXT_MENU_EXPORT_XLSX_ID = 'smartexcel-context-export-xlsx';
const CONTEXT_MENU_EXPORT_CSV_ID = 'smartexcel-context-export-csv';
const PLUGIN_TRIAL_EXPORTS = TRIAL_EXPORTS;

type PluginAccess = {
  licensed: boolean;
  member: boolean;
  plan: string;
  trialRemaining: number;
  trialLimit: number;
  allowed: boolean;
};

const EMPTY_ACCESS: PluginAccess = {
  licensed: false,
  member: false,
  plan: 'free',
  trialRemaining: 0,
  trialLimit: PLUGIN_TRIAL_EXPORTS,
  allowed: false,
};

function normalizeAccess(input: any): PluginAccess {
  const source = input?.pluginAccess ?? input ?? {};
  const trialLimit = Number(source.trialLimit ?? PLUGIN_TRIAL_EXPORTS);
  const trialRemaining = Math.max(
    0,
    Math.min(Number(source.trialRemaining ?? 0), trialLimit)
  );
  const licensed = Boolean(source.licensed);
  const member = Boolean(source.member);
  return {
    licensed,
    member,
    plan: String(source.plan ?? (member ? 'pro' : 'free')),
    trialRemaining,
    trialLimit,
    allowed: licensed || member || trialRemaining > 0,
  };
}

async function storeAccess(access: PluginAccess) {
  await browser.storage.local.set({
    se_plugin_licensed: access.licensed,
    se_plugin_member: access.member,
    se_plugin_plan: access.plan,
    se_trial_remaining: access.trialRemaining,
    se_trial_limit: access.trialLimit,
  });
}

function readStoredAccess(result: Record<string, unknown>): PluginAccess {
  return normalizeAccess({
    licensed: result.se_plugin_licensed,
    member: result.se_plugin_member,
    plan: result.se_plugin_plan,
    trialRemaining: result.se_trial_remaining,
    trialLimit: result.se_trial_limit ?? PLUGIN_TRIAL_EXPORTS,
  });
}
type ContextMenuState = {
  tableId: string | null;
  frameId?: number;
  isHeaderContext: boolean;
};
type PendingContextExport = {
  tabId: number;
  frameId?: number;
  tableId: string;
  format: 'xlsx' | 'csv';
};

type PreparedExportResponse = {
  ok: boolean;
  reason?: string;
  file?: {
    fileName: string;
    mimeType: string;
    base64: string;
  };
};

function buildBridgeUrl(options?: {
  authMode?: 'login' | 'register';
  planId?: string;
  redirectTo?: string;
  action?: 'logout';
}) {
  const bridgeUrl = new URL(PLUGIN_BRIDGE_URL);

  if (options?.action === 'logout') {
    bridgeUrl.searchParams.set('action', 'logout');
    return bridgeUrl.toString();
  }

  bridgeUrl.searchParams.set('auth', options?.authMode ?? 'login');

  if (options?.planId) {
    bridgeUrl.searchParams.set('planId', options.planId);
  }

  if (options?.redirectTo) {
    bridgeUrl.searchParams.set('redirectTo', options.redirectTo);
  }

  return bridgeUrl.toString();
}

/**
 * The plugin is a one-time purchase, so the payment page is the dedicated
 * plugin-payment page (not the website credit packs).
 */
function buildPaymentRedirectPath(lang?: 'zh' | 'en') {
  const path = lang === 'zh' ? '/zh/plugin-payment' : '/plugin-payment';
  const url = new URL(path, SMARTEXCEL_URL);
  url.searchParams.set('source', 'extension');
  url.searchParams.set('closeAfterPayment', 'true');
  return `${url.pathname}${url.search}`;
}

async function openPluginPaymentPage(lang?: 'zh' | 'en') {
  let targetLang = lang;
  if (!targetLang) {
    const stored = await browser.storage.local.get('se_lang');
    targetLang = stored.se_lang === 'zh' ? 'zh' : 'en';
  }
  const redirectTo = buildPaymentRedirectPath(targetLang);
  await openWebsiteWithPluginLogin(
    redirectTo,
    buildBridgeUrl({ authMode: 'register', redirectTo })
  );
}

function buildWebsiteRedirectPath(tableId?: string) {
  if (tableId) {
    return `/import?source=extension&tableId=${encodeURIComponent(tableId)}`;
  }

  return '/dashboard';
}

async function getStoredPluginSession() {
  const result = await browser.storage.local.get([
    'se_plugin_token',
    'se_plugin_token_expires_at',
    'se_logged_in',
    'se_credits',
    'se_email',
    'se_name',
    'se_user_id',
    'se_plugin_licensed',
    'se_plugin_member',
    'se_plugin_plan',
    'se_trial_remaining',
    'se_trial_limit',
  ]);

  return {
    token: (result.se_plugin_token as string) || '',
    tokenExpiresAt: (result.se_plugin_token_expires_at as string) || '',
    loggedIn: (result.se_logged_in as boolean) || false,
    credits: (result.se_credits as number) || 0,
    email: (result.se_email as string) || '',
    name: (result.se_name as string) || '',
    userId: (result.se_user_id as string) || '',
    access: readStoredAccess(result as Record<string, unknown>),
  };
}

async function clearPluginSession() {
  await browser.storage.local.remove([
    'se_plugin_token',
    'se_plugin_token_expires_at',
    'se_logged_in',
    'se_credits',
    'se_email',
    'se_name',
    'se_user_id',
    'se_plugin_licensed',
    'se_plugin_member',
    'se_plugin_plan',
    'se_trial_remaining',
    'se_trial_limit',
  ]);
}

async function storePluginSession(data: {
  token: string;
  expiresAt: string;
  credits: number;
  userId: string;
  email?: string;
  name?: string;
}) {
  await browser.storage.local.set({
    se_plugin_token: data.token,
    se_plugin_token_expires_at: data.expiresAt,
    se_logged_in: true,
    se_credits: data.credits,
    se_email: data.email ?? '',
    se_name: data.name ?? '',
    se_user_id: data.userId,
  });
}

async function fetchPluginMe(token: string) {
  const response = await fetch(PLUGIN_ME_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`plugin me failed: ${response.status}`);
  }

  return response.json();
}

async function refreshPluginState() {
  const stored = await getStoredPluginSession();

  if (!stored.token) {
    return {
      loggedIn: false,
      credits: 0,
      email: '',
      name: '',
      userId: '',
      tokenExpiresAt: '',
      pluginAccess: EMPTY_ACCESS,
    };
  }

  try {
    const data = await fetchPluginMe(stored.token);
    if (!data?.loggedIn) {
      await clearPluginSession();
      return {
        loggedIn: false,
        credits: 0,
        email: '',
        name: '',
        userId: '',
        tokenExpiresAt: '',
        pluginAccess: EMPTY_ACCESS,
      };
    }

    const pluginAccess = normalizeAccess(data);
    await storeAccess(pluginAccess);
    await browser.storage.local.set({
      se_logged_in: true,
      se_credits: data.credits ?? 0,
      se_email: data.email ?? '',
      se_name: data.name ?? '',
      se_user_id: data.userId ?? '',
      se_plugin_token_expires_at: data.tokenExpiresAt ?? stored.tokenExpiresAt,
    });

    return {
      loggedIn: true,
      credits: data.credits ?? 0,
      email: data.email ?? '',
      name: data.name ?? '',
      userId: data.userId ?? '',
      tokenExpiresAt: data.tokenExpiresAt ?? stored.tokenExpiresAt,
      pluginAccess,
    };
  } catch (error) {
    console.error('refresh plugin state failed:', error);
    return {
      loggedIn: stored.loggedIn,
      credits: stored.credits,
      email: stored.email,
      name: stored.name,
      userId: stored.userId,
      tokenExpiresAt: stored.tokenExpiresAt,
      pluginAccess: stored.access,
    };
  }
}

async function createWebsiteLoginTicket(
  token: string,
  redirectTo: string
): Promise<string | null> {
  const response = await fetch(PLUGIN_CREATE_LOGIN_TICKET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ redirectTo }),
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`create login ticket failed: ${response.status}`);
  }

  const data = await response.json();
  return (data.activateUrl as string) || null;
}

async function openWebsiteWithPluginLogin(
  redirectTo: string,
  fallbackUrl: string
) {
  const stored = await getStoredPluginSession();

  if (stored.token) {
    try {
      const activateUrl = await createWebsiteLoginTicket(stored.token, redirectTo);
      if (activateUrl) {
        await browser.tabs.create({ url: activateUrl });
        return;
      }
    } catch (error) {
      console.error('open website with plugin login failed:', error);
    }
  }

  await browser.tabs.create({ url: fallbackUrl });
}

async function requestPluginAccess(token: string, amount: number) {
  const response = await fetch(PLUGIN_ACCESS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount }),
  });

  if (response.status === 401) {
    await clearPluginSession();
    return null;
  }

  if (!response.ok) {
    throw new Error(`plugin access failed: ${response.status}`);
  }

  return response.json();
}

async function revokePluginToken(token: string) {
  try {
    await fetch(PLUGIN_REVOKE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    console.error('plugin revoke request failed:', error);
  }
}

function canInjectIntoUrl(url?: string) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId: number) {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'GET_TABLES' });
    return true;
  } catch {
    // Inject on demand below.
  }

  const tab = await browser.tabs.get(tabId);
  if (!canInjectIntoUrl(tab.url)) {
    return false;
  }

  await browser.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: [CONTENT_SCRIPT_PATH],
  });

  return true;
}

const contextStateByTabId = new Map<number, ContextMenuState>();
let pendingContextExport: PendingContextExport | null = null;

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ROOT_ID,
      title: 'SmartExcel 导出',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_EXPORT_XLSX_ID,
      parentId: CONTEXT_MENU_ROOT_ID,
      title: '导出 Excel',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_EXPORT_CSV_ID,
      parentId: CONTEXT_MENU_ROOT_ID,
      title: '导出 CSV',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });
  });
}

function updateContextMenuVisibility(state?: ContextMenuState) {
  void state;
}

/**
 * Check whether the plugin may export right now.
 *
 * Access comes from the one-time plugin license or an active website
 * membership. Credits belong to a separate system and are never spent here.
 */
async function checkExportAccess(
  amount = 1,
  lang?: 'zh' | 'en'
): Promise<{
  allowed: boolean;
  remaining?: number;
  isLoggedIn: boolean;
  reason?: string;
  required?: number;
  unlimited?: boolean;
  pluginAccess: PluginAccess;
}> {
  const normalizedAmount = Number.isFinite(amount)
    ? Math.max(1, Math.floor(amount))
    : 1;
  const stored = await getStoredPluginSession();

  if (!stored.token) {
    return {
      allowed: false,
      reason: 'not_logged_in',
      isLoggedIn: false,
      pluginAccess: EMPTY_ACCESS,
    };
  }

  try {
    const result = await requestPluginAccess(stored.token, normalizedAmount);
    if (result == null) {
      return {
        allowed: false,
        reason: 'not_logged_in',
        isLoggedIn: false,
        pluginAccess: EMPTY_ACCESS,
      };
    }

    const pluginAccess = normalizeAccess(result);
    await browser.storage.local.set({ se_logged_in: true });
    await storeAccess(pluginAccess);

    if (!result.accessAllowed) {
      return {
        allowed: false,
        reason: result.reason ?? 'payment_required',
        isLoggedIn: true,
        required: result.required ?? normalizedAmount,
        pluginAccess,
      };
    }

    const unlimited =
      Boolean(result.unlimited) || pluginAccess.licensed || pluginAccess.member;

    // The free trial just ran out on this export: open the unlock page once.
    if (!unlimited && pluginAccess.trialRemaining === 0) {
      void openPluginPaymentPage(lang).catch((error) => {
        console.error('open payment page after trial failed:', error);
      });
    }

    return {
      allowed: true,
      remaining: pluginAccess.trialRemaining,
      unlimited,
      isLoggedIn: true,
      pluginAccess,
    };
  } catch (error) {
    console.error('plugin access request failed:', error);
    return {
      allowed: false,
      reason: 'internal_error',
      isLoggedIn: true,
      pluginAccess: stored.access,
    };
  }
}

async function syncPluginState(data: {
  credits?: number;
  loggedIn: boolean;
  email?: string;
  name?: string;
  pluginAccess?: PluginAccess;
}): Promise<void> {
  await browser.storage.local.set({
    se_credits: data.credits ?? 0,
    se_logged_in: data.loggedIn,
    se_email: data.email ?? '',
    se_name: data.name ?? '',
  });
  if (data.pluginAccess) {
    await storeAccess(normalizeAccess(data.pluginAccess));
  }
}

async function syncPluginAuth(data: {
  token: string;
  expiresAt: string;
  credits: number;
  userId: string;
  email?: string;
  name?: string;
}): Promise<void> {
  await storePluginSession(data);

  try {
    const me = await fetchPluginMe(data.token);
    if (!me?.loggedIn) {
      await clearPluginSession();
      return;
    }

    await storeAccess(normalizeAccess(me));
    await browser.storage.local.set({
      se_logged_in: true,
      se_credits: me.credits ?? data.credits ?? 0,
      se_email: me.email ?? data.email ?? '',
      se_name: me.name ?? data.name ?? '',
      se_user_id: me.userId ?? data.userId,
      se_plugin_token_expires_at: me.tokenExpiresAt ?? data.expiresAt,
    });

    if (pendingContextExport) {
      const pending = pendingContextExport;
      pendingContextExport = null;
      await continuePendingContextExport(pending);
    }
  } catch (error) {
    console.error('plugin auth sync refresh failed:', error);
  }
}

async function dispatchContextExport(
  tabId: number,
  tableId: string,
  format: 'xlsx' | 'csv',
  frameId?: number,
): Promise<void> {
  const isReady = await ensureContentScript(tabId);
  if (!isReady) {
    return;
  }

  await browser.tabs.sendMessage(
    tabId,
    {
      type: 'EXPORT_CONTEXT_TABLE',
      payload: { tableId, format, skipAccessCheck: true },
    },
    frameId != null ? { frameId } : undefined,
  );
}

async function prepareContextExportFile(
  tabId: number,
  tableId: string,
  format: 'xlsx' | 'csv',
  frameId?: number,
): Promise<NonNullable<PreparedExportResponse['file']>> {
  const isReady = await ensureContentScript(tabId);
  if (!isReady) {
    throw new Error('content_script_unavailable');
  }

  const response = (await browser.tabs.sendMessage(
    tabId,
    {
      type: 'PREPARE_CONTEXT_EXPORT',
      payload: { tableId, format },
    },
    frameId != null ? { frameId } : undefined,
  )) as PreparedExportResponse | undefined;

  if (!response?.ok || !response.file) {
    throw new Error(response?.reason ?? 'prepare_context_export_failed');
  }

  return response.file;
}

async function downloadPreparedContextExport(
  file: NonNullable<PreparedExportResponse['file']>,
): Promise<void> {
  const dataUrl = `data:${file.mimeType};base64,${file.base64}`;
  await browser.downloads.download({
    url: dataUrl,
    filename: file.fileName,
    saveAs: false,
  });
}

async function notifyContextExportFeedback(
  tabId: number,
  format: 'xlsx' | 'csv',
  remaining?: number,
  unlimited?: boolean,
  frameId?: number,
): Promise<void> {
  try {
    await browser.tabs.sendMessage(
      tabId,
      {
        type: 'SHOW_EXPORT_FEEDBACK',
        payload: {
          format,
          remaining,
          unlimited: Boolean(unlimited),
        },
      },
      frameId != null ? { frameId } : undefined,
    );
  } catch (error) {
    console.warn('show export feedback failed:', error);
  }
}

async function notifyContextExportProgress(
  tabId: number,
  frameId?: number,
): Promise<void> {
  try {
    await browser.tabs.sendMessage(
      tabId,
      {
        type: 'SHOW_EXPORT_PROGRESS',
        payload: {},
      },
      frameId != null ? { frameId } : undefined,
    );
  } catch (error) {
    console.warn('show export progress failed:', error);
  }
}

async function continuePendingContextExport(
  pending: PendingContextExport,
): Promise<{ remaining?: number; unlimited?: boolean } | undefined> {
  const stored = await getStoredPluginSession();
  if (!stored.token) {
    pendingContextExport = pending;
    await browser.tabs.create({
      url: buildBridgeUrl({ authMode: 'login' }),
    });
    return;
  }

  const preparedFile = await prepareContextExportFile(
    pending.tabId,
    pending.tableId,
    pending.format,
    pending.frameId,
  );

  const access = await checkExportAccess(1);

  if (!access.allowed) {
    if (access.reason === 'not_logged_in') {
      pendingContextExport = pending;
      await browser.tabs.create({
        url: buildBridgeUrl({ authMode: 'login' }),
      });
      return;
    }

    await openWebsiteWithPluginLogin(
      buildPaymentRedirectPath(),
      buildBridgeUrl({
        authMode: 'register',
        redirectTo: buildPaymentRedirectPath(),
      }),
    );
    return undefined;
  }

  await downloadPreparedContextExport(preparedFile);
  return {
    remaining: access.remaining,
    unlimited: access.unlimited,
  };
}

// ─── Main background entry ─────────────────────────────────────────────────

export default defineBackground(() => {
  createContextMenus();

  browser.runtime.onInstalled.addListener(() => {
    createContextMenus();
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SET_CONTEXT_TABLE') {
      if (_sender.tab?.id != null) {
        const state: ContextMenuState = {
          tableId: message.payload?.tableId ?? null,
          frameId: _sender.frameId,
          isHeaderContext: Boolean(message.payload?.isHeaderContext),
        };
        contextStateByTabId.set(_sender.tab.id, state);
        updateContextMenuVisibility(state);
      }
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'OPEN_WEBSITE') {
      const redirectTo = buildWebsiteRedirectPath(message.payload?.tableId);
      const fallbackUrl = message.payload?.tableId
        ? `${SMARTEXCEL_URL}${redirectTo}`
        : SMARTEXCEL_URL;

      openWebsiteWithPluginLogin(redirectTo, fallbackUrl)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          console.error('open website failed:', error);
          sendResponse({ ok: false });
        });
      return true;
    }

    if (message.type === 'OPEN_LOGIN') {
      browser.tabs
        .create({
          url: buildBridgeUrl({ authMode: 'login' }),
        })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          console.error('open login bridge failed:', error);
          sendResponse({ ok: false });
        });
      return true;
    }

    if (message.type === 'OPEN_REGISTER') {
      browser.tabs
        .create({
          url: buildBridgeUrl({ authMode: 'register' }),
        })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          console.error('open register bridge failed:', error);
          sendResponse({ ok: false });
        });
      return true;
    }

    if (message.type === 'OPEN_PAYMENT_PAGE') {
      const lang = message.payload?.lang === 'zh' ? 'zh' : 'en';
      openPluginPaymentPage(lang)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          console.error('open payment page failed:', error);
          sendResponse({ ok: false });
        });
      return true;
    }

    // Check plugin access (license / membership / free trial)
    if (message.type === 'CHECK_EXPORT_ACCESS') {
      checkExportAccess(
        message.payload?.amount,
        message.payload?.lang === 'zh' ? 'zh' : 'en'
      ).then(sendResponse);
      return true; // keep channel open for async response
    }

    // Sync plugin access from website payment pages via postMessage relay
    if (message.type === 'PLUGIN_SYNC') {
      syncPluginState(message.data).then(() => sendResponse({ ok: true }));
      return true;
    }

    if (message.type === 'PLUGIN_AUTH_SYNC') {
      syncPluginAuth(message.data).then(() => sendResponse({ ok: true }));
      return true;
    }

    if (message.type === 'LOGOUT_PLUGIN') {
      getStoredPluginSession()
        .then(async (stored) => {
          if (stored.token) {
            await revokePluginToken(stored.token);
          }
          await clearPluginSession();
          const logoutTab = await browser.tabs.create({
            url: buildBridgeUrl({ action: 'logout' }),
            active: false,
          });
          if (logoutTab.id) {
            setTimeout(() => {
              browser.tabs.remove(logoutTab.id!).catch(() => undefined);
            }, 5000);
          }
          sendResponse({ ok: true });
        })
        .catch((error) => {
          console.error('logout plugin failed:', error);
          sendResponse({ ok: false });
        });
      return true;
    }

    if (message.type === 'CLEAR_PLUGIN_SESSION') {
      getStoredPluginSession()
        .then(async (stored) => {
          if (stored.token) {
            await revokePluginToken(stored.token);
          }
          await clearPluginSession();
          sendResponse({ ok: true });
        })
        .catch((error) => {
          console.error('clear plugin session failed:', error);
          sendResponse({ ok: false });
        });
      return true;
    }

    // Get current plugin state (for popup display)
    if (message.type === 'GET_STATE') {
      refreshPluginState().then(async (state) => {
        sendResponse({
          ...state,
          pluginAccess: state.pluginAccess ?? EMPTY_ACCESS,
          freeLimit: PLUGIN_TRIAL_EXPORTS,
        });
      });
      return true;
    }

    return false;
  });

  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      const isReady = await ensureContentScript(tab.id);
      if (!isReady) {
        return;
      }

      await browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    contextStateByTabId.delete(tabId);
    if (pendingContextExport?.tabId === tabId) {
      pendingContextExport = null;
    }
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) {
      return;
    }

    if (
      info.menuItemId !== CONTEXT_MENU_EXPORT_XLSX_ID &&
      info.menuItemId !== CONTEXT_MENU_EXPORT_CSV_ID
    ) {
      return;
    }

    const isReady = await ensureContentScript(tab.id);
    if (!isReady) {
      return;
    }

    const format = info.menuItemId === CONTEXT_MENU_EXPORT_CSV_ID ? 'csv' : 'xlsx';
    const contextState = contextStateByTabId.get(tab.id);
    const tableId = contextState?.tableId ?? null;
    const frameId = contextState?.frameId;

    if (!tableId || !contextState?.isHeaderContext) {
      return;
    }

    try {
      pendingContextExport = {
        tabId: tab.id,
        frameId,
        tableId,
        format,
      };
      await notifyContextExportProgress(tab.id, frameId);
      const feedback = await continuePendingContextExport(pendingContextExport);
      if (feedback !== undefined) {
        await notifyContextExportFeedback(
          tab.id,
          format,
          feedback.remaining,
          feedback.unlimited,
          frameId,
        );
      }
      updateContextMenuVisibility(undefined);
    } catch (error) {
      console.error('context menu export failed:', error);
    }
  });
});
