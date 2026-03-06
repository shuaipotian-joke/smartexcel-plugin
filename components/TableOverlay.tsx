import { useState, useEffect, useCallback, useRef } from 'react';
import { parseTable, type ParsedTable } from '@/utils/table-parser';
import { exportToExcel, copyTableToClipboard } from '@/utils/excel-export';
import { useExtensionStore } from '@/utils/store';

interface FloatingButton {
  visible: boolean;
  x: number;
  y: number;
  table: ParsedTable | null;
}

export default function TableOverlay() {
  const isEnabled = useExtensionStore((s) => s.isEnabled);
  const [fab, setFab] = useState<FloatingButton>({
    visible: false,
    x: 0,
    y: 0,
    table: null,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  useEffect(() => {
    if (!isEnabled) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const table = target.closest('table') as HTMLTableElement | null;
      if (!table) return;

      clearTimeout(hideTimer.current);

      const rect = table.getBoundingClientRect();
      const parsed = parseTable(table);
      if (parsed.rowCount === 0 && parsed.headers.length === 0) return;

      setFab({
        visible: true,
        x: rect.right + window.scrollX - 40,
        y: rect.top + window.scrollY + 4,
        table: parsed,
      });
    };

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (related?.closest('table')) return;

      hideTimer.current = setTimeout(() => {
        if (!menuOpen) {
          setFab((prev) => ({ ...prev, visible: false }));
        }
      }, 300);
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      clearTimeout(hideTimer.current);
    };
  }, [menuOpen, isEnabled]);

  const handleExport = useCallback(
    (format: 'xlsx' | 'csv') => {
      if (!fab.table) return;
      try {
        exportToExcel(fab.table, format);
        showToast(`已导出为 ${format.toUpperCase()}`);
      } catch {
        showToast('导出失败，请重试');
      }
      setMenuOpen(false);
    },
    [fab.table, showToast],
  );

  const handleCopy = useCallback(async () => {
    if (!fab.table) return;
    try {
      await copyTableToClipboard(fab.table);
      showToast('已复制到剪贴板');
    } catch {
      showToast('复制失败，请重试');
    }
    setMenuOpen(false);
  }, [fab.table, showToast]);

  const handleSendToWeb = useCallback(() => {
    browser.runtime.sendMessage({
      type: 'OPEN_WEBSITE',
      payload: { tableId: fab.table?.id },
    });
    setMenuOpen(false);
  }, [fab.table]);

  if (!fab.visible || !isEnabled) return null;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: `${fab.x}px`,
          top: `${fab.y}px`,
          zIndex: 2147483647,
        }}
        onMouseEnter={() => clearTimeout(hideTimer.current)}
        onMouseLeave={() => {
          if (!menuOpen) {
            hideTimer.current = setTimeout(() => {
              setFab((prev) => ({ ...prev, visible: false }));
            }, 300);
          }
        }}
      >
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            backgroundColor: '#1a73f5',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(26,115,245,0.35)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          }}
          title="SmartExcel - 导出表格"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
          </svg>
        </button>

        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '36px',
              right: '0',
              width: '200px',
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              animation: 'smartexcel-fadein 0.15s ease',
            }}
          >
            <div style={{ padding: '10px 14px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '12px', color: '#6b7280' }}>
              {fab.table?.rowCount} 行 × {fab.table?.colCount} 列
            </div>

            <MenuItem icon="📊" label="导出为 Excel" sublabel=".xlsx" onClick={() => handleExport('xlsx')} />
            <MenuItem icon="📄" label="导出为 CSV" sublabel=".csv" onClick={() => handleExport('csv')} />
            <MenuItem icon="📋" label="复制到剪贴板" onClick={handleCopy} />
            <div style={{ height: '1px', backgroundColor: '#e5e7eb' }} />
            <MenuItem icon="🚀" label="发送到 SmartExcel" sublabel="AI 处理" onClick={handleSendToWeb} />
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#1a73f5', color: '#fff', padding: '10px 20px',
          borderRadius: '8px', fontSize: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 2147483647, animation: 'smartexcel-fadein 0.2s ease',
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes smartexcel-fadein {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

function MenuItem({ icon, label, sublabel, onClick }: {
  icon: string;
  label: string;
  sublabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px', backgroundColor: 'transparent', border: 'none',
        cursor: 'pointer', fontSize: '13px', color: '#374151',
        transition: 'background-color 0.1s', textAlign: 'left',
      }}
      onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <span style={{ fontSize: '16px' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {sublabel && <span style={{ fontSize: '11px', color: '#9ca3af' }}>{sublabel}</span>}
    </button>
  );
}
