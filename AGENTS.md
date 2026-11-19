# SmartExcel Plugin Agent Guide

This file is for the `smartexcel-plugin` browser extension repo only.

The plugin is coupled to the sibling website repo `../smartexcel` (Next.js, `/api/plugin/*`). The extension exports tables locally; the website only decides whether **this device** is activated. If a task changes activation, the Buy/payment entry or the activation API, validate the website repo too.

## Access model (keep both repos consistent)

- **No login, no accounts.** The extension identifies the device, never a user. There is no login ticket, `auth/me`, account UI or free trial in the extension.
- **Device ID:** a random UUID created on first run (`utils/activation.ts` → `getDeviceId`), kept in `storage.local` and mirrored to `storage.sync` so a reinstall on the same browser profile keeps it.
- **Activated or not.** An activated device exports without limits; a locked device blocks every export with an "Enter activation code" card plus a "Buy" button (popup and in-page prompt).
- **Activation codes are single-use.** A code activates one device, once. The same code on the same device again is fine (idempotent); a code that was unbound by an admin can never be used again. Admins generate codes on smarterexcel.com.
- **Buying activates the device directly, without a code.** "Buy" opens `/{zh|en}/plugin-payment?source=extension&closeAfterPayment=true&deviceId=…` (always locale-prefixed: an unprefixed path follows the site's `NEXT_LOCALE` cookie and could show the wrong currency). The payment webhook activates that device id on the server. Price: ¥9.9 via XorPay (zh) or $5 via Stripe (en); one-time, separate from website credits.
- **Already-active device + new code:** the server keeps the existing activation and does not use the code; the response has `alreadyActivated: true`. The extension shows "This device is already activated" and keeps the existing code hint (or "Activated by purchase").

The production `.env.local` points `WXT_SMARTEXCEL_URL` at `https://smarterexcel.com`; it defaults to `http://localhost:42100`. Never call `api.smarterexcel.com` or `/v1/*`.

## Activation API (website)

Called from the background worker only (CORS allows extension origins):

| Endpoint | Body | Answer | Rate limit (per IP) |
| --- | --- | --- | --- |
| `POST /api/plugin/activation/activate` | `{ code, deviceId, browser?, version? }` | 200 `{ activated: true, activatedAt, alreadyActivated, activeSource?, codeHint? }`; 400/403/404/409 `{ activated: false, error }` with `bad_request` / `code_revoked` / `invalid_code` / `code_used_by_other_device`; 429 `rate_limited` | 10 per 10 min |
| `POST /api/plugin/activation/status` | `{ deviceId, browser?, version? }` | 200 `{ activated, activatedAt? }` | 600 per 10 min |

`alreadyActivated`, `activeSource` (`code` / `payment`) and `codeHint` (last 4 chars of the code the device keeps, null for a payment) are extra fields; older servers omit them and the extension then treats the answer as a new activation.

The old `/api/plugin/auth/*`, `/api/plugin/access` and `/api/plugin/credits` endpoints still exist on the website for old store versions of the extension. Do not use them in new code.

## Runtime flows

- **Start:** `background.ts` creates the device ID and calls `refreshActivationIfStale()`. A cached activation is trusted at once (works offline); an activated device re-checks `/status` about once a day, a locked one after a minute. Only an explicit `{ activated: false }` from the server locks; network/server errors keep the cache.
- **Export:** content/popup → `CHECK_EXPORT_ACCESS` → `{ allowed }` from the cache. Blocked context-menu exports are kept and finished after activation.
- **Code:** popup/overlay form → `ACTIVATE` → `activateDevice()` → storage update → popup and overlay follow `storage.onChanged`.
- **Buy:** `OPEN_PAYMENT_PAGE` → `openPurchasePage()` opens the tab and `watchPaymentTab()` polls `/status` every 4 s while it is open (max 15 min) and once when it closes. When the device is activated it unlocks, finishes a pending export, and after 3 s closes the payment tab **it opened**, but only if that tab is still on the website or `checkout.stripe.com` (browsers block the page's own `window.close()` after a Stripe redirect).
- **No window messages.** The content script has no `window` `message` listener and the website no longer posts `SE_PLUGIN_SYNC`; activation state only comes from the background's own API calls. If a page→extension message is ever needed again, accept it only from `https://smarterexcel.com`.

Background message types (`utils/messaging.ts`): `SET_CONTEXT_TABLE`, `OPEN_PAYMENT_PAGE`, `CHECK_EXPORT_ACCESS`, `ACTIVATE`, `GET_STATE`. Content-script types: `GET_TABLES`, `EXPORT_TABLE`, `EXPORT_ALL`, `COPY_TABLE`, `PREPARE_CONTEXT_EXPORT`, `SHOW_EXPORT_FEEDBACK`, `SHOW_EXPORT_PROGRESS`, `SHOW_ACTIVATION_PROMPT`.

## Storage keys (`browser.storage.local`)

| Key | Meaning |
| --- | --- |
| `se_device_id` | Device UUID (also in `storage.sync`). |
| `se_activated` | Cached activation (`true` / `false`). |
| `se_activated_at` | ISO time of the activation. |
| `se_activation_code_hint` | Last 4 chars of the code the device is on; absent → activated by purchase. |
| `se_activation_checked_at` | Last `/status` answer (ms), drives the re-check interval. |
| `se_show_table_icon` | "Show table icon on pages" toggle (default on). Off hides the hover icon on all pages at once; right-click menu and popup export keep working. |
| `se_lang` | `zh` / `en` override of the browser-region default. |

## Repo layout

- `entrypoints/background.ts`: message routing, access check, context menu, payment-tab watch.
- `utils/activation.ts`: device ID, activate/status calls, cache, purchase page and payment-tab watch/close.
- `utils/use-activation.ts`: activation-code form hook shared by popup and overlay; `openBuyPage`.
- `entrypoints/content.tsx`: table detection on pages, mounts the overlay, runs exports.
- `entrypoints/popup/App.tsx` (tables, activation card) and `SettingsPanel.tsx` (language, activation status, device ID, table-icon toggle).
- `components/TableOverlay.tsx`: hover icon, export menu, in-page activation prompt.
- `utils/table-parser.ts` (HTML parsing), `utils/excel-export.ts` (SheetJS files).
- `utils/i18n.ts` (zh/en strings), `utils/store.ts` (Zustand prefs), `utils/theme.ts` + `tailwind.config.ts` (Claude-style tokens: warm off-white, clay accent, serif headings; no Anthropic logos).
- `wxt.config.ts`: manifest, permissions, browser targets. `.output/`: builds.

## Run, build, check

- Use `npm` here (not pnpm). `npm install`, then `npm run dev` / `dev:edge` / `dev:firefox`.
- `npm run build`, `npm run build:edge`, `npm run build:firefox`, `npm run build:all`; zips with `npm run zip*` (release only, with the owner's go-ahead).
- Type check: `npx wxt prepare && npx tsc --noEmit`.
- There are no unit tests. The minimum gate is both builds plus tsc; access or export changes also need a browser run.

## Testing against a local website

1. Website (`../smartexcel`, pnpm): a local Postgres on `127.0.0.1:62100` (Docker), or PGlite without Docker: in a scratch folder `npm install @electric-sql/pglite @electric-sql/pglite-socket`, `npx pglite-server --db=./data --port=62199 --max-connections=10`, set `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:62199/postgres?sslmode=disable` **and `DATABASE_POOL_MAX=1`** (PGlite runs one connection; without it you get random ECONNRESET 500s) in the website `.env.local`, run `pnpm db:migrate` and apply `0009_dual_credit_balances.sql` by hand (missing from the drizzle journal). Start `pnpm dev` (port 42100).
2. Admin: sign up, set the user's `role` to `admin` in the DB, open `/admin/plugin-activation` and generate codes.
3. Extension: `WXT_SMARTEXCEL_URL=http://localhost:42100` in `.env.local`, `npm run build`, load `.output/chrome-mv3/` unpacked.
4. Check: locked export shows the code card; a code activates; the same code on a second device profile gives "already activated on another device"; a second code on an active device shows "already activated" and stays unused in the admin table; revoke/unbind in admin locks the device after the next status check; Buy opens the locale page, a (simulated) paid order unlocks the popup, finishes a pending export, and closes the payment tab; the table-icon toggle hides the hover icon on all tabs.
5. Restart the dev server between full runs: the activate limit is 10 per 10 min per IP and is kept in memory.

## Done means

- Both builds and tsc pass, and the change was checked in a real browser (popup, overlay and background path together). Record what you could not test.
- For table/export changes, export at least one real `.xlsx` or `.csv` from a page with tables. Known gap: rowspan cells and multi-row headers are not merged in exports.
