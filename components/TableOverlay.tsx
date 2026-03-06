import { useState, useEffect, useCallback, useRef } from 'react';
import { parseTable, type ParsedTable } from '@/utils/table-parser';
import { exportToExcel, copyTableToClipboard } from '@/utils/excel-export';
import { useExtensionStore } from '@/utils/store';

type CreditCheckResult = {
  allowed: boolean;
  remaining?: number;
  isLoggedIn: boolean;
  reason?: string;
};

async function requestCheckAndConsume(): Promise<CreditCheckResult> {
  try {
    return await browser.runtime.sendMessage({ type: 'CHECK_AND_CONSUME' });
  } catch {
    // Fallback if background not available
    return { allowed: false, reason: 'error', isLoggedIn: false };
  }
}

function openPaymentPage() {
  browser.runtime.sendMessage({ type: 'OPEN_PAYMENT_PAGE' });
}

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
  const [withIndex, setWithIndex] = useState(false);
  const [toast, setToast] = useState('');
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fabRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  useEffect(() => {
    if (fab.table?.hasCssRowNumbers) {
      setWithIndex(true);
    } else {
      setWithIndex(false);
    }
  }, [fab.table]);

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
        x: rect.right - 40,
        y: rect.top + 4,
        table: parsed,
      });
    };

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (related?.closest('table')) return;
      if (fabRef.current?.contains(related as Node)) return;

      hideTimer.current = setTimeout(() => {
        if (!menuOpen) {
          setFab((prev) => ({ ...prev, visible: false }));
          setMenuOpen(false);
        }
      }, 400);
    };

    const handleScroll = () => {
      if (fab.visible && !menuOpen) {
        setFab((prev) => ({ ...prev, visible: false }));
      }
    };

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
      window.removeEventListener('scroll', handleScroll, true);
      clearTimeout(hideTimer.current);
    };
  }, [menuOpen, isEnabled, fab.visible]);

  const handleExport = useCallback(
    async (format: 'xlsx' | 'csv') => {
      if (!fab.table) return;
      setMenuOpen(false);

      // 向后台请求积分检查并扣除
      const result = await requestCheckAndConsume();

      if (!result.allowed) {
        // 无积分，打开支付页面
        openPaymentPage();
        return;
      }

      try {
        exportToExcel(fab.table, { format, withIndex });
        if (result.isLoggedIn) {
          const hint = result.remaining !== undefined ? `，剩余 ${result.remaining} 积分` : '';
          showToast(`已导出为 ${format.toUpperCase()}${hint}`);
        } else {
          const hint = result.remaining !== undefined && result.remaining > 0
            ? `，剩余 ${result.remaining} 次免费`
            : result.remaining === 0
              ? '，免费次数已用完'
              : '';
          showToast(`已导出为 ${format.toUpperCase()}${hint}`);
        }
      } catch {
        showToast('导出失败，请重试');
      }
    },
    [fab.table, withIndex, showToast],
  );

  const handleCopy = useCallback(async () => {
    if (!fab.table) return;
    setMenuOpen(false);

    const result = await requestCheckAndConsume();

    if (!result.allowed) {
      openPaymentPage();
      return;
    }

    try {
      await copyTableToClipboard(fab.table, withIndex);
      const hint = result.isLoggedIn
        ? (result.remaining !== undefined ? `，剩余 ${result.remaining} 积分` : '')
        : (result.remaining !== undefined && result.remaining > 0 ? `，剩余 ${result.remaining} 次免费` : '');
      showToast(`已复制到剪贴板${hint}`);
    } catch {
      showToast('复制失败，请重试');
    }
  }, [fab.table, withIndex, showToast]);

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
        ref={fabRef}
        style={{
          position: 'fixed',
          left: `${fab.x}px`,
          top: `${fab.y}px`,
          zIndex: 2147483647,
          pointerEvents: 'auto',
        }}
        onMouseEnter={() => clearTimeout(hideTimer.current)}
        onMouseLeave={() => {
          if (!menuOpen) {
            hideTimer.current = setTimeout(() => {
              setFab((prev) => ({ ...prev, visible: false }));
            }, 400);
          }
        }}
      >
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            backgroundColor: '#1a73f5',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 12px rgba(26,115,245,0.4)',
            transition: 'transform 0.15s, box-shadow 0.15s',
            pointerEvents: 'auto',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.12)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(26,115,245,0.5)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 12px rgba(26,115,245,0.4)';
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
              top: '38px',
              right: '0',
              width: '220px',
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              animation: 'smartexcel-fadein 0.15s ease',
              pointerEvents: 'auto',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {/* Table info */}
            <div style={{
              padding: '10px 14px', backgroundColor: '#f9fafb',
              borderBottom: '1px solid #e5e7eb', fontSize: '12px', color: '#6b7280',
            }}>
              📋 {fab.table?.rowCount} 行 × {fab.table?.colCount} 列
            </div>

            {/* Index toggle — auto-shown when CSS row numbers detected */}
            <div
              style={{
                padding: '8px 14px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6',
                backgroundColor: fab.table?.hasCssRowNumbers ? '#eff6ff' : 'transparent',
              }}
            >
              <span style={{ fontSize: '12px', color: '#374151' }}>
                {fab.table?.hasCssRowNumbers ? '🔢 检测到序号列' : '🔢 添加序号列'}
              </span>
              <label style={{
                position: 'relative', display: 'inline-block',
                width: '36px', height: '20px', cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={withIndex}
                  onChange={(e) => setWithIndex(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
                <span style={{
                  position: 'absolute', inset: 0, borderRadius: '10px',
                  backgroundColor: withIndex ? '#1a73f5' : '#d1d5db',
                  transition: 'background-color 0.2s',
                }} />
                <span style={{
                  position: 'absolute', top: '2px',
                  left: withIndex ? '18px' : '2px',
                  width: '16px', height: '16px', borderRadius: '50%',
                  backgroundColor: '#fff', transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </label>
            </div>

            <MenuItem icon="📊" label="导出为 Excel" sublabel=".xlsx" onClick={() => handleExport('xlsx')} />
            <MenuItem icon="📄" label="导出为 CSV" sublabel=".csv" onClick={() => handleExport('csv')} />
            <MenuItem icon="📋" label="复制到剪贴板" onClick={handleCopy} />
            <div style={{ height: '1px', backgroundColor: '#f3f4f6', margin: '0 10px' }} />
            <MenuItem icon="🚀" label="发送到 SmartExcel" sublabel="AI 处理" onClick={handleSendToWeb} />
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#1a73f5', color: '#fff', padding: '10px 24px',
          borderRadius: '10px', fontSize: '14px', boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          zIndex: 2147483647, animation: 'smartexcel-fadein 0.2s ease',
          pointerEvents: 'auto', fontFamily: 'system-ui, -apple-system, sans-serif',
          whiteSpace: 'nowrap',
        }}>
          ✓ {toast}
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
        transition: 'background-color 0.12s', textAlign: 'left',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        pointerEvents: 'auto',
      }}
      onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <span style={{ fontSize: '16px', lineHeight: 1 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {sublabel && <span style={{ fontSize: '11px', color: '#9ca3af' }}>{sublabel}</span>}
    </button>
  );
}
