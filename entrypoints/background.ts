import {
  activateDevice,
  checkStatusNow,
  createPaymentQr,
  getActivationState,
  getDeviceId,
  refreshActivationIfStale,
  waitForPayment,
} from '@/utils/activation';
import {
  PAYMENT_WAIT_PORT,
  type ExportAccessResult,
  type PaymentWaitPortMessage,
} from '@/utils/messaging';

const CONTENT_SCRIPT_PATH = 'content-scripts/content.js';
const CONTEXT_MENU_ROOT_ID = 'smartexcel-context-root';
const CONTEXT_MENU_EXPORT_XLSX_ID = 'smartexcel-context-export-xlsx';
const CONTEXT_MENU_EXPORT_CSV_ID = 'smartexcel-context-export-csv';

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

/** A blocked context-menu export is resumed after activation only this long. */
const PENDING_EXPORT_TTL_MS = 10 * 60 * 1000;

type PreparedExportResponse = {
  ok: boolean;
  reason?: string;
  file?: {
    fileName: string;
    mimeType: string;
    base64: string;
  };
};

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
let pendingContextExport: (PendingContextExport & { blockedAt: number }) | null = null;

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

/**
 * Check whether this device may export right now.
 *
 * A cached activation is trusted immediately (and re-checked in the
 * background when stale). A locked device asks the server first, so an
 * activation made elsewhere is picked up without reopening the popup.
 */
async function checkExportAccess(): Promise<ExportAccessResult> {
  const cached = await getActivationState();
  if (cached.activated) {
    void refreshActivationIfStale();
    return { allowed: true };
  }

  await refreshActivationIfStale();
  const current = await getActivationState();
  return current.activated
    ? { allowed: true }
    : { allowed: false, reason: 'not_activated' };
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

async function sendToFrame(
  tabId: number,
  message: { type: string; payload?: unknown },
  frameId?: number,
): Promise<void> {
  try {
    await browser.tabs.sendMessage(
      tabId,
      message,
      frameId != null ? { frameId } : undefined,
    );
  } catch (error) {
    console.warn(`${message.type} failed:`, error);
  }
}

/**
 * Run a context-menu export. When the device is not activated the page shows
 * the activation prompt and the export is kept, so a successful activation
 * finishes it.
 */
async function runContextExport(pending: PendingContextExport): Promise<void> {
  const access = await checkExportAccess();
  if (!access.allowed) {
    pendingContextExport = { ...pending, blockedAt: Date.now() };
    await sendToFrame(pending.tabId, { type: 'SHOW_ACTIVATION_PROMPT' }, pending.frameId);
    return;
  }

  pendingContextExport = null;
  await sendToFrame(pending.tabId, { type: 'SHOW_EXPORT_PROGRESS', payload: {} }, pending.frameId);
  const preparedFile = await prepareContextExportFile(
    pending.tabId,
    pending.tableId,
    pending.format,
    pending.frameId,
  );
  await downloadPreparedContextExport(preparedFile);
  await sendToFrame(
    pending.tabId,
    { type: 'SHOW_EXPORT_FEEDBACK', payload: { format: pending.format } },
    pending.frameId,
  );
}

/** After any activation: finish the context-menu export it blocked, if recent. */
function resumePendingContextExport() {
  const pending = pendingContextExport;
  if (!pending) return;
  pendingContextExport = null;
  if (Date.now() - pending.blockedAt > PENDING_EXPORT_TTL_MS) return;
  void runContextExport(pending).catch((error) =>
    console.error('resume context export failed:', error),
  );
}

// ─── Main background entry ─────────────────────────────────────────────────

export default defineBackground(() => {
  createContextMenus();

  // Create the device ID early and refresh a stale activation on start.
  void getDeviceId()
    .then(() => refreshActivationIfStale())
    .catch((error) => console.error('activation start-up check failed:', error));

  browser.runtime.onInstalled.addListener(() => {
    createContextMenus();
  });

  browser.runtime.onStartup.addListener(() => {
    void refreshActivationIfStale();
  });

  // A shown payment QR holds a port open. The wait loop long-polls the
  // website for the port's current order; paying activates this device on
  // the server, popup and overlay follow the storage change, and a blocked
  // context-menu export is finished here. Closing the card disconnects the
  // port: the request is aborted and the status is checked one last time.
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== PAYMENT_WAIT_PORT) return;
    let current: AbortController | null = null;
    const stop = () => {
      current?.abort();
      current = null;
    };
    port.onMessage.addListener((raw: unknown) => {
      const message = raw as PaymentWaitPortMessage | null;
      if (message?.type === 'PING') return; // keeps the worker alive
      stop();
      if (message?.type !== 'WATCH' || !message.orderId) return;
      const controller = new AbortController();
      current = controller;
      const orderId = message.orderId;
      void waitForPayment(orderId, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        current = null;
        if (result === 'paid') resumePendingContextExport();
        try {
          port.postMessage({ type: result === 'paid' ? 'PAID' : 'EXPIRED', orderId });
        } catch {
          // The card closed in between.
        }
      });
    });
    port.onDisconnect.addListener(() => {
      stop();
      void checkStatusNow()
        .then(() => getActivationState())
        .then((state) => {
          if (state.activated) resumePendingContextExport();
        })
        .catch((error) => console.error('final payment status check failed:', error));
    });
  });

  browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    if (message.type === 'SET_CONTEXT_TABLE') {
      if (_sender.tab?.id != null) {
        contextStateByTabId.set(_sender.tab.id, {
          tableId: message.payload?.tableId ?? null,
          frameId: _sender.frameId,
          isHeaderContext: Boolean(message.payload?.isHeaderContext),
        });
      }
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'CREATE_PAYMENT_QR') {
      const payType = message.payload?.payType === 'alipay' ? 'alipay' : 'native';
      createPaymentQr(payType)
        .then(sendResponse)
        .catch((error) => {
          console.error('create payment QR failed:', error);
          sendResponse({ ok: false, error: 'network_error' });
        });
      return true;
    }

    if (message.type === 'CHECK_EXPORT_ACCESS') {
      checkExportAccess()
        .then(sendResponse)
        .catch((error) => {
          console.error('check export access failed:', error);
          sendResponse({ allowed: false, reason: 'not_activated' });
        });
      return true;
    }

    if (message.type === 'ACTIVATE') {
      activateDevice(String(message.payload?.code ?? ''))
        .then((result) => {
          sendResponse(result);
          if (result.ok) resumePendingContextExport();
        })
        .catch((error) => {
          console.error('activate failed:', error);
          sendResponse({ ok: false, error: 'network_error' });
        });
      return true;
    }

    // Activation state for the popup; a stale cache is refreshed in the
    // background and the popup follows the storage change.
    if (message.type === 'GET_STATE') {
      getActivationState()
        .then((state) => {
          sendResponse(state);
          void refreshActivationIfStale();
        })
        .catch((error) => {
          console.error('get activation state failed:', error);
          sendResponse(null);
        });
      return true;
    }

    // Every sender is our own code; unknown types get no answer.
    sendResponse(undefined);
    return true;
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

    if (!tableId || !contextState?.isHeaderContext) {
      return;
    }

    try {
      await runContextExport({
        tabId: tab.id,
        frameId: contextState.frameId,
        tableId,
        format,
      });
    } catch (error) {
      console.error('context menu export failed:', error);
    }
  });
});
