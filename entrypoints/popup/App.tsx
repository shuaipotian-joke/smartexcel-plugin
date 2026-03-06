import { useState, useEffect, useCallback } from 'react';
import type { TableInfo } from '@/utils/messaging';

export default function App() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTables();
  }, []);

  async function loadTables() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        const result = await browser.tabs.sendMessage(tab.id, { type: 'GET_TABLES' });
        setTables(result ?? []);
      }
    } catch {
      setTables([]);
    } finally {
      setLoading(false);
    }
  }

  const handleExportAll = useCallback(async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      browser.tabs.sendMessage(tab.id, { type: 'EXPORT_ALL' });
    }
  }, []);

  return (
    <div className="w-[360px] min-h-[200px] bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
          </svg>
        </div>
        <div>
          <h1 className="text-white font-semibold text-sm">SmartExcel</h1>
          <p className="text-white/70 text-xs">网页表格智能导出</p>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : tables.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-gray-500 text-sm">当前页面未检测到表格</p>
            <p className="text-gray-400 text-xs mt-1">鼠标悬停在表格上即可显示导出按钮</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-600">
                检测到 <strong className="text-brand-600">{tables.length}</strong> 个表格
              </span>
              {tables.length > 1 && (
                <button
                  className="text-xs bg-brand-50 text-brand-600 px-3 py-1 rounded-full hover:bg-brand-100 transition-colors font-medium"
                  onClick={handleExportAll}
                >
                  全部导出
                </button>
              )}
            </div>
            {tables.map((table) => (
              <TableCard key={table.id} table={table} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-3">
        <button
          className="text-xs text-gray-400 hover:text-brand-600 transition-colors"
          onClick={() => browser.runtime.sendMessage({ type: 'OPEN_WEBSITE' })}
        >
          打开 SmartExcel 网站 →
        </button>
      </div>
    </div>
  );
}

function TableCard({ table }: { table: TableInfo }) {
  const handleExport = useCallback(
    async (format: 'xlsx' | 'csv') => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, {
          type: 'EXPORT_TABLE',
          payload: { tableId: table.id, format },
        });
      }
    },
    [table.id],
  );

  return (
    <div className="border border-gray-100 rounded-xl p-3 hover:border-brand-200 hover:bg-brand-50/30 transition-all group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 truncate max-w-[180px]">
          {table.title}
        </span>
        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
          {table.rowCount}×{table.colCount}
        </span>
      </div>

      {table.headers.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {table.headers.slice(0, 4).map((h, i) => (
            <span key={i} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
              {h.length > 10 ? h.slice(0, 10) + '…' : h}
            </span>
          ))}
          {table.headers.length > 4 && (
            <span className="text-[10px] text-gray-400">+{table.headers.length - 4}</span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => handleExport('xlsx')}
          className="flex-1 text-xs bg-brand-600 text-white py-1.5 rounded-lg hover:bg-brand-700 transition-colors font-medium"
        >
          导出 Excel
        </button>
        <button
          onClick={() => handleExport('csv')}
          className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          CSV
        </button>
      </div>
    </div>
  );
}
