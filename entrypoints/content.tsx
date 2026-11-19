import ReactDOM from 'react-dom/client';
import TableOverlay, { ACTIVATION_PROMPT_EVENT } from '@/components/TableOverlay';
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
import { t } from '@/utils/i18n';
import type { ExportAccessResult } from '@/utils/messaging';
import { useExtensionStore } from '@/utils/store';
import { theme } from '@/utils/theme';
import '@/assets/styles/tailwind.css';

let toastHost: HTMLDivElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let lastContextTable: TableElement | null = null;

function currentLang() {
  return useExtensionStore.getState().lang;
}

function showPageToast(message: string, duration = 2200) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    Object.assign(toastHost.style, {
      position: 'fixed',
      left: '50%',
      bottom: '24px',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      background: theme.ink,
      color: theme.paper,
      padding: '10px 18px',
      borderRadius: '12px',
      fontSize: '13px',
      lineHeight: '1.4',
      boxShadow: theme.shadowLift,
      fontFamily: theme.fontSans,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 160ms ease',
    } satisfies Partial<CSSStyleDeclaration>);
    document.documentElement.appendChild(toastHost);
  }

  toastHost.textContent = message;
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

function hidePageToast() {
  if (toastHost) {
    toastHost.style.opacity = '0';
  }
}

async function requestExportAccess(): Promise<ExportAccessResult> {
  const result = await safeSendRuntimeMessage<ExportAccessResult>({
    type: 'CHECK_EXPORT_ACCESS',
  });
  return result ?? { allowed: false, reason: 'not_activated' };
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
    void useExtensionStore.getState().initPrefs();

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

    // No window postMessage listener: activation state comes only from the
    // background worker, so web pages cannot change it.

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

    browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
      const tables = detectTables();
      const lang = currentLang();

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

        // Popup-initiated exports: when the device is not activated the
        // popup shows its own activation form, so only the reason is returned.
        case 'EXPORT_TABLE': {
          void (async () => {
            const access = await requestExportAccess();
            if (!access.allowed) {
              sendResponse({ ok: false, reason: access.reason });
              return;
            }

            const { format } = message.payload;
            const table = findTableById(tables, message.payload?.tableId);
            if (!table) {
              sendResponse({ ok: false, reason: 'table_not_found' });
              return;
            }
            exportToExcel(parseTable(table), { format });
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
            if (exportTables.length === 0) {
              sendResponse({ ok: false, reason: 'table_not_found' });
              return;
            }
            const access = await requestExportAccess();
            if (!access.allowed) {
              sendResponse({ ok: false, reason: access.reason });
              return;
            }

            exportMultipleTables(
              exportTables.map((t) => parseTable(t)),
              document.title || 'tables-export',
            );
            sendResponse({ ok: true });
          })();
          break;
        }

        case 'COPY_TABLE': {
          void (async () => {
            const access = await requestExportAccess();
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

        // Context-menu export: the background checked access already and
        // downloads the file this frame prepares.
        case 'PREPARE_CONTEXT_EXPORT': {
          const { format, tableId } = message.payload ?? {};
          const table = resolveContextTable(tables, tableId);
          if (!table) {
            hidePageToast();
            sendResponse({ ok: false, reason: 'table_not_found' });
            break;
          }

          try {
            const file = prepareExportFile(parseTable(table), { format });
            sendResponse({ ok: true, file });
          } catch (error) {
            console.error('prepare context export failed:', error);
            showPageToast(t('exportFailed', lang));
            sendResponse({ ok: false, reason: 'export_failed' });
          }
          break;
        }

        case 'SHOW_EXPORT_FEEDBACK': {
          const fmt = (message.payload?.format ?? 'xlsx').toUpperCase();
          showPageToast(t('exportedAs', lang, { fmt }));
          sendResponse({ ok: true });
          break;
        }

        case 'SHOW_EXPORT_PROGRESS': {
          showPageToast(message.payload?.message || t('exportingPleaseWait', lang), 0);
          sendResponse({ ok: true });
          break;
        }

        case 'SHOW_ACTIVATION_PROMPT': {
          hidePageToast();
          window.dispatchEvent(new CustomEvent(ACTIVATION_PROMPT_EVENT));
          sendResponse({ ok: true });
          break;
        }
      }

      return true;
    });
  },
});
