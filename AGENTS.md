# SmartExcel Plugin Agent Guide

This file is for the `smartexcel-plugin` browser extension repo only.

The plugin is tightly coupled to the sibling website repo `../smartexcel`. The extension is not only a local export tool; it also depends on the website for plugin login, plugin license, and access sync. If a task changes plugin access, payment entry, login redirects, or sync behavior, assume the website repo may also need validation or code changes.

Plugin commercial model (keep both repos consistent):

- The plugin is sold as a **one-time license**, charged separately from the website credit system: ¥9.9 CNY through XorPay for the Chinese market, $5 USD through Stripe for the international market.
- Buying the plugin never grants credits, and exports never spend credits.
- Website members (`pro` / `max` subscription) can use the plugin free while the membership is active.
- Every logged-in account gets 10 free trial exports; the counter is tracked server-side (`plugin_entitlement.trial_used`).

The website is now a single Next.js full-stack app. Plugin-facing website APIs live under `/api/plugin/*`; do not reintroduce old `/v1/plugin/*` calls. The extension's production `.env.local` points `WXT_SMARTEXCEL_URL` at `https://smarterexcel.com`.

## Repo Layout And Important Directories

- `entrypoints/background.ts` is the most important runtime file. It handles plugin access, login state, payment-page opening, message routing, and sync from the website.
- `entrypoints/content.tsx` runs on web pages, detects tables, renders page-level behaviors, and bridges page interactions.
- `entrypoints/popup/` contains the popup entrypoint and UI.
- `components/TableOverlay.tsx` is the main in-page export UI. Changes here directly affect the core export experience.
- `utils/excel-export.ts` contains SheetJS export logic.
- `utils/table-parser.ts` contains HTML table detection and parsing logic.
- `utils/messaging.ts` defines message contracts between popup, content script, and background worker.
- `utils/store.ts` contains Zustand state used by the extension UI.
- `utils/export-limit.ts` is legacy/unused; `background.ts` is the active source of truth for plugin access and trial limits.
- `assets/styles/` contains extension styles.
- `public/` contains static assets bundled into the extension.
- `wxt.config.ts` controls manifest, permissions, and browser-target build behavior.
- `.output/` contains dev/build artifacts and unpacked browser builds.

## How To Run The Project

- Use `npm` in this repo. Do not switch package managers unless the repo is explicitly migrated.
- Install dependencies with `npm install`.
- Start Chrome development with `npm run dev`.
- Start Edge development with `npm run dev:edge`.
- Start Firefox development with `npm run dev:firefox`.
- Build outputs appear under `.output/`.
- For real QA, load the unpacked extension from `.output/chrome-mv3/` or `.output/edge-mv3/` into the target browser and test on pages that contain actual HTML tables.

## Build, Test, And Lint Commands

- `npm run dev`, `npm run dev:edge`, and `npm run dev:firefox` run browser-targeted dev sessions.
- `npm run build`, `npm run build:edge`, and `npm run build:firefox` create production builds.
- `npm run build:all` builds Chrome, Firefox, and Edge targets.
- `npm run zip`, `npm run zip:edge`, `npm run zip:firefox`, and `npm run zip:all` package release archives.
- There is no dedicated `lint` or `test` script in `package.json` right now.
- Use the relevant build command as the minimum verification gate when no more specific automated check exists.

## Workflow Expectations For Codex

- Keep the extension’s three runtime surfaces in mind together: background, content script, and popup.
- Do not treat a popup-only or content-only change as complete until the message path through `background.ts` still works.
- When editing export behavior, prefer keeping parsing in `table-parser.ts` and file generation in `excel-export.ts` instead of mixing responsibilities into UI components.
- When editing access, license, or login behavior, inspect `background.ts` first because it is the extension source of truth.
- If a task mentions website login, plugin payment/license, or `postMessage` sync, inspect the sibling `smartexcel` repo as part of the task.

## Critical Runtime Flows

- Export flow is: content/page UI -> background message -> credit check or free-limit check -> export allowed or payment/login redirect.
- Logged-in export access is handled in `entrypoints/background.ts` by calling `https://smarterexcel.com/api/plugin/access` with the stored plugin bearer token. That endpoint returns the license/membership state and consumes free-trial exports only; `https://smarterexcel.com/api/plugin/consume` belongs to the separate website credit system.
- Plugin auth state is refreshed with `/api/plugin/auth/me`; login ticket creation uses `/api/plugin/auth/create-login-ticket`; logout/revoke uses `/api/plugin/auth/revoke`.
- Do not use `api.smarterexcel.com` or `/v1/*` for new plugin work. The main domain serves Next API routes under `/api/*`.
- The main background message types include opening the website, opening the payment page, checking export access (`CHECK_EXPORT_ACCESS`), syncing from the website, and reporting extension state.
- The extension stores important local state in `browser.storage.local`, including `se_plugin_licensed`, `se_plugin_member`, `se_trial_remaining`, logged-in state, and user identity. `se_credits` is mirrored for reference only and is not spent by exports.
- Payment completion on the website syncs access state back into the extension through the `SE_PLUGIN_SYNC` postMessage bridge. Changes around the license or payment must preserve that bridge.
- The plugin trial is 10 free exports (`PLUGIN_TRIAL_EXPORTS` on the website, `NEW_USER_BONUS_CREDITS` in the extension). Keep popup, settings, and in-page login-required text consistent if this number changes.

## Website Integration Notes

- Local website repo: `C:\project\smartexcel`.
- Website local app port: `42100`.
- Website production app on `jokeovh`: container `smartexcel-next`, host port `127.0.0.1:42100`, public domain `https://smarterexcel.com`.
- Production compose currently builds from `/opt/projects/smartexcel-next-deploy`, not the legacy `/opt/projects/smartexcel` directory. The legacy directory may contain old dirty Go/frontend files; do not reset it casually.
- When testing plugin credit flows locally, use the website's `/api/plugin/auth/exchange-session`, `/api/plugin/auth/me`, and `/api/plugin/consume` endpoints.

## What Done Means And How To Verify Work

- Done means the extension works in a real browser flow, not only that the TypeScript files were edited.
- Always run at least the relevant build command before calling work complete, usually `npm run build` or `npm run build:edge`.
- For table detection or export changes, verify on a real page with one or more HTML tables and test at least one actual export format such as `.xlsx` or `.csv`.
- For popup changes, verify the popup renders, displays correct state, and triggers the expected background behavior.
- For background or messaging changes, verify the end-to-end path across popup/content/background instead of checking only one module.
- For access logic changes, verify an unlocked path (license or membership), a trial path, and a blocked path after the trial is used up.
- For payment or login redirects, verify that the extension opens `/plugin-payment` (with `closeAfterPayment=true`) and can still resume the intended flow afterward.
- For website-integration changes, validate the related behavior against the sibling `smartexcel` repo as far as the environment allows.
- Do not mark work done if the final browser verification was skipped or blocked. Record the blocker clearly instead.
