import ReactDOM from 'react-dom/client';
import TableOverlay from '@/components/TableOverlay';
import { safeSendRuntimeMessage } from '@/utils/extension-runtime';
import {
  detectTables,
  findClosestTableElement,
  getLogicalTable,
  parseTable,
  type TableElement,
} from '@/utils/table-parser';
import {
  exportToExcel,
  exportMultipleTables,
  copyTableToClipboard,
  prepareExportFile,
} from '@/utils/excel-export';
import { t, detectBrowserLang } from '@/utils/i18n';
import '@/assets/styles/tailwind.css';

type CreditCheckResult = {
  allowed: boolean;
  remaining?: number;
  isLoggedIn: boolean;
  reason?: string;
  requiredCredits?: number;
};

type ExportAccessResult = CreditCheckResult & { openedFlow?: 'login' | 'payment' };

let toastHost: HTMLDivElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let lastContextTable: TableElement | null = null;

function showPageToast(message: string, duration = 2200) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.style.position = 'fixed';
    toastHost.style.left = '50%';
    toastHost.style.bottom = '24px';
    toastHost.style.transform = 'translateX(-50%)';
    toastHost.style.zIndex = '2147483647';
    toastHost.style.background = '#173127';
    toastHost.style.color = '#fff';
    toastHost.style.padding = '10px 18px';
    toastHost.style.borderRadius = '12px';
    toastHost.style.fontSize = '13px';
    toastHost.style.boxShadow = '0 24px 54px -34px rgba(24,79,62,0.58)';
    toastHost.style.fontFamily = 'Aptos, "Segoe UI Variable", "Segoe UI", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
    toastHost.style.whiteSpace = 'nowrap';
    toastHost.style.pointerEvents = 'none';
    toastHost.style.opacity = '0';
    toastHost.style.transition = 'opacity 160ms ease';
    document.documentElement.appendChild(toastHost);
  }

  toastHost.textContent = `✓ ${message}`;
  toastHost.style.opacity = '1';

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  if (duration > 0) {
    toastTimer = setTimeout(() => {
      if (toastHost) {
        toastHost.style.opacity = '0';
      }
    }, duration);
  }
}

async function requestCheckAndConsume(amount = 1): Promise<CreditCheckResult> {
  const result = await safeSendRuntimeMessage<CreditCheckResult>({
    type: 'CHECK_AND_CONSUME',
    payload: { amount },
  });
  return result ?? { allowed: false, reason: 'error', isLoggedIn: false };
}

async function ensureExportAccess(
  amount = 1,
  lang = detectBrowserLang()
): Promise<ExportAccessResult> {
  const result = await requestCheckAndConsume(amount);
  if (result.allowed) {
    return result;
  }

  if (result.reason === 'not_logged_in') {
    await safeSendRuntimeMessage({ type: 'OPEN_LOGIN' });
    return { ...result, openedFlow: 'login' };
  }

  await safeSendRuntimeMessage({
    type: 'OPEN_PAYMENT_PAGE',
    payload: { lang },
  });
  return { ...result, openedFlow: 'payment' };
}

function findTableById(
  tables: TableElement[],
  tableId?: string
): TableElement | undefined {
  if (!tableId) {
    return tables[0];
  }

  return tables.find((table) => table.dataset.smartexcelTableId === tableId);
}

function resolveContextTable(
  tables: TableElement[],
  tableId?: string
): TableElement | undefined {
  if (lastContextTable && document.contains(lastContextTable)) {
    const contextTable = getLogicalTable(lastContextTable);
    const parsedContextId = parseTable(contextTable).id;
    if (!tableId || parsedContextId === tableId) {
      return contextTable;
    }
  }

  return findTableById(tables, tableId);
}

function isHeaderContext(target: HTMLElement | null, table: TableElement | null): boolean {
  if (!target || !table) {
    return false;
  }

  if (target.closest('th, [role="columnheader"], [role="rowheader"]')) {
    return true;
  }

  if (table.classList.contains('el-table__header')) {
    return true;
  }

  return Boolean(target.closest('.el-table__header-wrapper, .ag-header, .MuiDataGrid-columnHeaders, .rdg-header-row'));
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  cssInjectionMode: 'ui',

  async main(ctx) {
    const lang = detectBrowserLang();
    const ui = await createShadowRootUi(ctx, {
      name: 'smartexcel-overlay',
      position: 'overlay',
      zIndex: 2147483647,
      onMount(container) {
        const wrapper = document.createElement('div');
        container.append(wrapper);
        const root = ReactDOM.createRoot(wrapper);
        root.render(<TableOverlay />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();

    // Relay postMessage from smartexcel.app pages (e.g. plugin-payment after payment success)
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type === 'SE_PLUGIN_AUTH' && e.data?.data) {
        void safeSendRuntimeMessage({ type: 'PLUGIN_AUTH_SYNC', data: e.data.data });
      }

      if (e.data?.type === 'SE_PLUGIN_SYNC' && e.data?.data) {
        void safeSendRuntimeMessage({ type: 'PLUGIN_SYNC', data: e.data.data });
      }

      if (e.data?.type === 'SE_PLUGIN_LOGOUT') {
        void safeSendRuntimeMessage({ type: 'CLEAR_PLUGIN_SESSION' });
      }
    });

    const reportContextTarget = (target: HTMLElement | null) => {
      const hoveredTable = findClosestTableElement(target);
      const table = hoveredTable ? getLogicalTable(hoveredTable) : null;
      const headerContext = isHeaderContext(target, hoveredTable);
      lastContextTable = table;

      void safeSendRuntimeMessage({
        type: 'SET_CONTEXT_TABLE',
        payload: {
          tableId: table ? parseTable(table).id : null,
          isHeaderContext: headerContext,
        },
      });
    };

    document.addEventListener(
      'mousedown',
      (event: MouseEvent) => {
        if (event.button !== 2) {
          return;
        }

        reportContextTarget(event.target as HTMLElement | null);
      },
      true,
    );

    document.addEventListener(
      'contextmenu',
      (event: MouseEvent) => {
        reportContextTarget(event.target as HTMLElement | null);
      },
      true,
    );

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const tables = detectTables();

      switch (message.type) {
        case 'GET_TABLES': {
          const parsed = tables.map((t) => {
            const p = parseTable(t);
            return {
              id: p.id,
              title: p.title,
              rowCount: p.rowCount,
              colCount: p.colCount,
              headers: p.headers,
              preview: p.rows.slice(0, 3),
            };
          });
          sendResponse(parsed);
          break;
        }

        case 'EXPORT_TABLE': {
          void (async () => {
            const access = await ensureExportAccess(1, lang);
            if (!access.allowed) {
              sendResponse({ ok: false, reason: access.reason });
              return;
            }

            const { format } = message.payload;
            const table = findTableById(tables, message.payload?.tableId);
            if (table) {
              exportToExcel(parseTable(table), { format });
            }
            sendResponse({ ok: true });
          })();
          break;
        }

        case 'EXPORT_ALL': {
          void (async () => {
            const selectedIds = message.payload?.tableIds;
            const exportTables = selectedIds
              ? tables.filter((table) => selectedIds.includes(table.dataset.smartexcelTableId ?? ''))
              : tables;
            const tableCount = exportTables.length;
            if (tableCount === 0) {
              sendResponse({ ok: false, reason: 'table_not_found' });
              return;
            }
            const access = await ensureExportAccess(tableCount, lang);
            if (!access.allowed) {
              sendResponse({
                ok: false,
                reason: access.reason,
                requiredCredits: access.requiredCredits ?? tableCount,
              });
              return;
            }

            const allParsed = exportTables.map((t) => parseTable(t));
            if (allParsed.length > 0) {
              exportMultipleTables(allParsed, document.title || 'tables-export');
            }
            sendResponse({ ok: true });
          })();
          break;
        }

        case 'COPY_TABLE': {
          void (async () => {
            const access = await ensureExportAccess(1, lang);
            if (!access.allowed) {
              sendResponse({ ok: false, reason: access.reason });
              return;
            }

            const target = findTableById(tables, message.payload?.tableId);
            if (target) {
              await copyTableToClipboard(parseTable(target));
            }
            sendResponse({ ok: true });
          })();
          break;
        }

        case 'EXPORT_CONTEXT_TABLE': {
          void (async () => {
            const { format, tableId, skipAccessCheck } = message.payload ?? {};
            if (!skipAccessCheck) {
              const access = await ensureExportAccess(1, lang);
              if (!access.allowed) {
                sendResponse({ ok: false, reason: access.reason });
                return;
              }
            }

            const table = resolveContextTable(tables, tableId);
            if (!table) {
              sendResponse({ ok: false, reason: 'table_not_found' });
              return;
            }

            try {
              exportToExcel(parseTable(table), { format });
              sendResponse({ ok: true });
            } catch (error) {
              console.error('context export failed:', error);
              showPageToast(t('exportFailed', lang));
              sendResponse({ ok: false, reason: 'export_failed' });
            }
          })();
          break;
        }

        case 'PREPARE_CONTEXT_EXPORT': {
          void (async () => {
            const { format, tableId } = message.payload ?? {};
            const table = resolveContextTable(tables, tableId);
            if (!table) {
              sendResponse({ ok: false, reason: 'table_not_found' });
              return;
            }

            try {
              const file = prepareExportFile(parseTable(table), { format });
              sendResponse({ ok: true, file });
            } catch (error) {
              console.error('prepare context export failed:', error);
              showPageToast(t('exportFailed', lang));
              sendResponse({ ok: false, reason: 'export_failed' });
            }
          })();
          break;
        }

        case 'SHOW_EXPORT_FEEDBACK': {
          const { format, remaining, used = 1 } = message.payload ?? {};
          const fmt = (format ?? 'xlsx').toUpperCase();
          const messageText =
            remaining !== undefined
              ? t('exportedWithCreditInfo', lang, { fmt, used, n: remaining })
              : t('exportedAs', lang, { fmt });
          showPageToast(messageText);
          sendResponse({ ok: true });
          break;
        }

        case 'SHOW_EXPORT_PROGRESS': {
          const messageText =
            message.payload?.message || t('exportingPleaseWait', lang);
          showPageToast(messageText, 0);
          sendResponse({ ok: true });
          break;
        }
      }

      return true;
    });
  },
});
