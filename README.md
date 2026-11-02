# SmartExcel Plugin

SmartExcel Plugin is an open-source browser extension that detects HTML tables on web pages and exports them to Excel-compatible files.

It is designed as the browser-extension companion to the SmartExcel website, which handles plugin login, the one-time plugin license, and access sync. The plugin is sold once — ¥9.9 CNY via XorPay or $5 USD via Stripe depending on the user's language — and it is billed separately from the website credit system. Website members (`pro` / `max`) use the plugin free while their membership is active, and every logged-in account starts with 10 free trial exports.

## What It Does

- Detects HTML tables on any web page.
- Shows a floating SmartExcel export button when the user hovers over a table.
- Exports a single table as `.xlsx` or `.csv`.
- Exports all detected tables from the popup.
- Preserves table headers and structured cell data where possible.
- Checks login and plugin access (license, membership, or free trial) before export flows; exports never spend credits.
- Opens the SmartExcel website for login, registration, and the one-time plugin purchase flow.
- Syncs plugin authentication, license, and membership state from the website.
- Displays the popup language from the user's browser region by default, with manual language switching in settings.

## Browser Support

| Browser | Manifest | Status |
| --- | --- | --- |
| Chrome | MV3 | Supported |
| Edge | MV3 | Supported |
| Firefox | MV2/MV3 through WXT | Supported |
| Safari | MV2/MV3 through WXT | Experimental |
| Brave / Arc / Opera | MV3 | Compatible with Chromium builds |

## Project Roles

| Path | Role |
| --- | --- |
| `entrypoints/background.ts` | Runtime coordinator for login state, plugin access, trial limits, payment redirects, context-menu actions, and extension messages. |
| `entrypoints/content.tsx` | Content script that runs on web pages, detects tables, handles page-level export actions, and mounts the floating table overlay. |
| `entrypoints/popup/App.tsx` | Main popup panel that lists detected tables, displays account or plugin access state, and starts export/login/payment actions. |
| `entrypoints/popup/SettingsPanel.tsx` | Popup settings screen for language, account state, login, registration, and logout controls. |
| `components/TableOverlay.tsx` | Floating in-page SmartExcel button and export menu shown next to hovered tables. |
| `utils/table-parser.ts` | HTML table detection and parsing logic. |
| `utils/excel-export.ts` | SheetJS-based file generation for Excel and CSV exports. |
| `utils/messaging.ts` | Message contract types shared by popup, content script, and background worker. |
| `utils/store.ts` | Zustand state for extension UI settings such as enabled state and language. |
| `utils/i18n.ts` | Chinese/English translations and region-aware default language detection. |
| `utils/extension-runtime.ts` | Safe runtime helpers for extension-context checks and messaging. |
| `utils/ensure-content-script.ts` | Helper used by the popup to make sure the active tab can receive content-script messages. |
| `tailwind.config.ts` | Extension theme tokens aligned with the SmartExcel website visual style. |
| `wxt.config.ts` | WXT extension configuration, manifest metadata, permissions, and browser build setup. |

## Design Direction

The extension UI follows the SmartExcel website style:

- warm off-white surfaces;
- green SmartExcel brand accents;
- soft borders and shadows;
- compact shadcn-style controls;
- simple lucide icons;
- restrained motion and hover states.

## Language Behavior

The popup and overlay support Chinese and English.

By default, the extension detects the user's browser locale and regional hints. Chinese-speaking locales and common Chinese-region time zones show Chinese. Other regions fall back to English. Users can override the language in the popup settings panel.

## Development

Use `npm` in this repository.

```bash
npm install
npm run dev
```

Browser-specific development:

```bash
npm run dev:edge
npm run dev:firefox
```

## Build

```bash
# Chrome MV3 build
npm run build

# Edge MV3 build
npm run build:edge

# Firefox build
npm run build:firefox

# All browser builds
npm run build:all
```

Build outputs are written to `.output/`.

For real QA, load the unpacked extension from `.output/chrome-mv3/` or `.output/edge-mv3/` and test on pages with real HTML tables.

## Release Archives

```bash
npm run zip
npm run zip:edge
npm run zip:firefox
npm run zip:all
```

## Repository Layout

```text
smartexcel-plugin/
├── assets/styles/          # Tailwind entry styles
├── components/             # Shared React components
├── entrypoints/            # WXT background, content, and popup entrypoints
├── public/                 # Extension icons and static assets
├── utils/                  # Export, parsing, messaging, i18n, and store helpers
├── wxt.config.ts           # Extension manifest and WXT config
├── tailwind.config.ts      # Theme tokens
└── package.json            # Scripts and dependencies
```

## Contributing

Issues and pull requests are welcome. Please keep changes focused and run the relevant build command before opening a PR.

For changes involving plugin access, the one-time license, login redirects, payment entry, or website sync, validate the sibling SmartExcel website repo as well because those flows depend on both projects.

## License

MIT License. See [LICENSE](./LICENSE).
