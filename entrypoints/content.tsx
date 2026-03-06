import ReactDOM from 'react-dom/client';
import TableOverlay from '@/components/TableOverlay';
import { detectTables, parseTable } from '@/utils/table-parser';
import { exportToExcel, exportMultipleTables, copyTableToClipboard } from '@/utils/excel-export';
import '@/assets/styles/tailwind.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
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
      if (e.data?.type === 'SE_PLUGIN_SYNC' && e.data?.data) {
        browser.runtime.sendMessage({ type: 'PLUGIN_SYNC', data: e.data.data });
      }
    });

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
          const { format } = message.payload;
          const table = tables[0];
          if (table) {
            exportToExcel(parseTable(table), format);
          }
          break;
        }

        case 'EXPORT_ALL': {
          const allParsed = tables.map((t) => parseTable(t));
          if (allParsed.length > 0) {
            exportMultipleTables(allParsed, document.title || 'tables-export');
          }
          break;
        }

        case 'COPY_TABLE': {
          const target = tables[0];
          if (target) {
            copyTableToClipboard(parseTable(target));
          }
          break;
        }
      }

      return true;
    });
  },
});
