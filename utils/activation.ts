/**
 * Device activation (background only).
 *
 * The extension has no user accounts. It identifies the device with a random
 * UUID and asks smarterexcel.com whether that device is activated:
 *
 *   POST /api/plugin/activation/activate { code, deviceId, browser?, version? }
 *   POST /api/plugin/activation/status   { deviceId }
 *
 * The cached result is trusted on start so exports work offline; the server is
 * re-checked at most about once a day and only an explicit
 * `{ activated: false }` from the server locks the extension again.
 */

/**
 * The website. An explicit `WXT_SMARTEXCEL_URL` always wins; otherwise only dev
 * mode (`wxt`) falls back to the local website, every production build
 * (`wxt build` / `wxt zip`) uses smarterexcel.com.
 */
export const SMARTEXCEL_URL =
  import.meta.env.WXT_SMARTEXCEL_URL ||
  (import.meta.env.DEV ? 'http://localhost:42100' : 'https://smarterexcel.com');

const ACTIVATE_URL = `${SMARTEXCEL_URL}/api/plugin/activation/activate`;
const STATUS_URL = `${SMARTEXCEL_URL}/api/plugin/activation/status`;

/** Re-check an activated device at most this often. */
const ACTIVATED_RECHECK_MS = 24 * 60 * 60 * 1000;
/** A locked device asks again at most this often (e.g. after paying on the website). */
const LOCKED_RECHECK_MS = 60 * 1000;
/** While a payment tab is open, ask this often, for at most this long. */
const PAYMENT_POLL_MS = 4 * 1000;
const PAYMENT_WATCH_MAX_MS = 15 * 60 * 1000;

const KEY_DEVICE_ID = 'se_device_id';
const KEY_ACTIVATED = 'se_activated';
const KEY_ACTIVATED_AT = 'se_activated_at';
const KEY_CODE_HINT = 'se_activation_code_hint';
const KEY_CHECKED_AT = 'se_activation_checked_at';

/** Errors from the API contract plus the client-side ones. */
export type ActivationError =
  | 'invalid_code'
  | 'code_revoked'
  | 'code_used_by_other_device'
  | 'bad_request'
  | 'rate_limited'
  | 'network_error'
  | 'server_error';

export type ActivationState = {
  deviceId: string;
  activated: boolean;
  activatedAt: string;
  /** Last characters of the code this device was activated with, for display. */
  codeHint: string;
};

export type ActivateResult =
  /**
   * `alreadyActivated`: the device was already active (another code or a
   * purchase); the server kept that and did not use the entered code.
   */
  | { ok: true; state: ActivationState; alreadyActivated: boolean }
  | { ok: false; error: ActivationError };

const CONTRACT_ERRORS = new Set<ActivationError>([
  'invalid_code',
  'code_revoked',
  'code_used_by_other_device',
  'bad_request',
]);

let deviceIdPromise: Promise<string> | null = null;
let statusCheck: Promise<void> | null = null;

/**
 * The device ID: created once, kept in storage.local and mirrored to
 * storage.sync so a reinstall on the same browser profile keeps it.
 */
export function getDeviceId(): Promise<string> {
  deviceIdPromise ??= loadOrCreateDeviceId().catch((error) => {
    deviceIdPromise = null;
    throw error;
  });
  return deviceIdPromise;
}

async function readSyncDeviceId(): Promise<string> {
  try {
    const synced = await browser.storage.sync.get(KEY_DEVICE_ID);
    return typeof synced[KEY_DEVICE_ID] === 'string' ? synced[KEY_DEVICE_ID] : '';
  } catch {
    // storage.sync can be disabled by policy; the local copy is enough then.
    return '';
  }
}

async function writeSyncDeviceId(deviceId: string) {
  try {
    await browser.storage.sync.set({ [KEY_DEVICE_ID]: deviceId });
  } catch (error) {
    console.warn('mirror device id to storage.sync failed:', error);
  }
}

async function loadOrCreateDeviceId(): Promise<string> {
  const local = await browser.storage.local.get(KEY_DEVICE_ID);
  const localId = typeof local[KEY_DEVICE_ID] === 'string' ? local[KEY_DEVICE_ID] : '';
  if (localId) {
    if (!(await readSyncDeviceId())) {
      await writeSyncDeviceId(localId);
    }
    return localId;
  }

  const deviceId = (await readSyncDeviceId()) || crypto.randomUUID();
  await browser.storage.local.set({ [KEY_DEVICE_ID]: deviceId });
  await writeSyncDeviceId(deviceId);
  return deviceId;
}

export async function getActivationState(): Promise<ActivationState> {
  const deviceId = await getDeviceId();
  const stored = await browser.storage.local.get([
    KEY_ACTIVATED,
    KEY_ACTIVATED_AT,
    KEY_CODE_HINT,
  ]);
  return {
    deviceId,
    activated: stored[KEY_ACTIVATED] === true,
    activatedAt: (stored[KEY_ACTIVATED_AT] as string) || '',
    codeHint: (stored[KEY_CODE_HINT] as string) || '',
  };
}

function detectBrowserName(): string {
  if (import.meta.env.BROWSER) {
    return import.meta.env.BROWSER;
  }
  return /Edg\//.test(navigator.userAgent) ? 'edge' : 'chrome';
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body (proxy error page etc.); handled by the status code below.
  }
  return { status: response.status, ok: response.ok, data };
}

export async function activateDevice(rawCode: string): Promise<ActivateResult> {
  const code = normalizeCode(rawCode);
  if (!code) {
    return { ok: false, error: 'bad_request' };
  }

  const deviceId = await getDeviceId();
  let result: Awaited<ReturnType<typeof postJson>>;
  try {
    result = await postJson(ACTIVATE_URL, {
      code,
      deviceId,
      browser: detectBrowserName(),
      version: browser.runtime.getManifest().version,
    });
  } catch (error) {
    console.error('activation request failed:', error);
    return { ok: false, error: 'network_error' };
  }

  if (result.ok && result.data?.activated === true) {
    // Older servers omit `alreadyActivated`; treat that as a new activation.
    const alreadyActivated = result.data.alreadyActivated === true;
    await browser.storage.local.set({
      [KEY_ACTIVATED]: true,
      [KEY_ACTIVATED_AT]: String(result.data.activatedAt ?? new Date().toISOString()),
      [KEY_CHECKED_AT]: Date.now(),
    });
    if (!alreadyActivated) {
      await browser.storage.local.set({ [KEY_CODE_HINT]: code.slice(-4) });
    } else if (typeof result.data.codeHint === 'string' && result.data.codeHint) {
      // The code the device keeps, not the unused one just entered.
      await browser.storage.local.set({ [KEY_CODE_HINT]: result.data.codeHint });
    } else if (result.data.activeSource === 'payment') {
      await browser.storage.local.remove(KEY_CODE_HINT);
    }
    return { ok: true, state: await getActivationState(), alreadyActivated };
  }

  if (result.status === 429) {
    return { ok: false, error: 'rate_limited' };
  }
  const error = result.data?.error as ActivationError | undefined;
  if (error && CONTRACT_ERRORS.has(error)) {
    return { ok: false, error };
  }
  return { ok: false, error: result.status >= 500 ? 'server_error' : 'bad_request' };
}

/**
 * Ask the server for this device's status and update the cache. Network and
 * server errors keep the cached state; only `{ activated: false }` locks.
 */
export async function checkStatusNow(): Promise<void> {
  const deviceId = await getDeviceId();
  try {
    const result = await postJson(STATUS_URL, { deviceId });
    if (!result.ok || typeof result.data?.activated !== 'boolean') {
      return;
    }

    if (result.data.activated) {
      await browser.storage.local.set({
        [KEY_ACTIVATED]: true,
        [KEY_ACTIVATED_AT]: String(result.data.activatedAt ?? ''),
        [KEY_CHECKED_AT]: Date.now(),
      });
    } else {
      await browser.storage.local.set({
        [KEY_ACTIVATED]: false,
        [KEY_CHECKED_AT]: Date.now(),
      });
      await browser.storage.local.remove([KEY_ACTIVATED_AT, KEY_CODE_HINT]);
    }
  } catch (error) {
    console.warn('activation status check failed, keeping cached state:', error);
  }
}

/**
 * Re-check the server when the cached answer is old enough. An activated
 * device re-checks about once a day; a locked one re-checks after a minute,
 * so an activation made elsewhere (e.g. after payment) is picked up quickly.
 */
export async function refreshActivationIfStale(): Promise<void> {
  if (statusCheck) {
    return statusCheck;
  }

  const stored = await browser.storage.local.get([KEY_ACTIVATED, KEY_CHECKED_AT]);
  const checkedAt = Number(stored[KEY_CHECKED_AT] ?? 0);
  const maxAge = stored[KEY_ACTIVATED] === true ? ACTIVATED_RECHECK_MS : LOCKED_RECHECK_MS;
  if (Date.now() - checkedAt < maxAge) {
    return;
  }

  statusCheck = checkStatusNow().finally(() => {
    statusCheck = null;
  });
  return statusCheck;
}

/**
 * Where "Buy" goes: the one-time plugin payment page with this device's ID.
 * A successful payment activates the device on the server (no code); the
 * returned tab is watched with `watchPaymentTab` to pick that up.
 */
export async function openPurchasePage(lang: 'zh' | 'en'): Promise<number | undefined> {
  const deviceId = await getDeviceId();
  // Always prefix the locale: an unprefixed path follows the site's
  // NEXT_LOCALE cookie, so "Buy · $5" could land on the ¥9.9 zh page.
  const url = new URL(`/${lang}/plugin-payment`, SMARTEXCEL_URL);
  url.searchParams.set('source', 'extension');
  url.searchParams.set('closeAfterPayment', 'true');
  url.searchParams.set('deviceId', deviceId);
  const tab = await browser.tabs.create({ url: url.toString() });
  return tab.id;
}

const watchedPaymentTabs = new Set<number>();

/** Leave the success page up this long before closing the payment tab. */
const PAYMENT_TAB_CLOSE_DELAY_MS = 3 * 1000;

/** Origins the payment tab may be on when the extension closes it. */
const PAYMENT_TAB_ORIGINS = [new URL(SMARTEXCEL_URL).origin, 'https://checkout.stripe.com'];

/**
 * Close the payment tab the extension opened, after activation. The page
 * can't reliably close itself (browsers block window.close() after a
 * redirect). Left open if the user has navigated the tab elsewhere.
 */
async function closePaymentTab(tabId: number) {
  await new Promise((resolve) => setTimeout(resolve, PAYMENT_TAB_CLOSE_DELAY_MS));
  try {
    const tab = await browser.tabs.get(tabId);
    const origin = tab.url ? new URL(tab.url).origin : '';
    if (!PAYMENT_TAB_ORIGINS.includes(origin)) return;
    await browser.tabs.remove(tabId);
  } catch {
    // Already closed.
  }
}

/**
 * Poll the activation status while the payment tab is open (every few
 * seconds, at most 15 minutes) and once more when it closes. Calls
 * `onActivated` once if the device becomes activated, then closes the tab
 * if it is still on the payment site.
 */
export function watchPaymentTab(tabId: number, onActivated: () => void): void {
  if (watchedPaymentTabs.has(tabId)) return;
  watchedPaymentTabs.add(tabId);
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    clearTimeout(timer);
    watchedPaymentTabs.delete(tabId);
    browser.tabs.onRemoved.removeListener(onRemoved);
  };
  const check = async () => {
    await checkStatusNow();
    if ((await getActivationState()).activated) {
      stop();
      onActivated();
      return true;
    }
    return false;
  };
  const tick = async () => {
    if (await check()) {
      void closePaymentTab(tabId);
      return;
    }
    if (Date.now() - startedAt >= PAYMENT_WATCH_MAX_MS) {
      // Stop polling; the check on close still runs.
      timer = undefined;
      return;
    }
    timer = setTimeout(() => void tick(), PAYMENT_POLL_MS);
  };
  function onRemoved(closedTabId: number) {
    if (closedTabId !== tabId) return;
    stop();
    void check();
  }

  browser.tabs.onRemoved.addListener(onRemoved);
  timer = setTimeout(() => void tick(), PAYMENT_POLL_MS);
}
