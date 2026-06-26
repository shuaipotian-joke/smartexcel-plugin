import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  findClosestTableElement,
  getLogicalTable,
  getLogicalTableBounds,
  parseTable,
  type ParsedTable,
} from '@/utils/table-parser';
import {
  isExtensionContextValid,
  safeAddStorageChangedListener,
  safeSendRuntimeMessage,
} from '@/utils/extension-runtime';
import { exportToExcel } from '@/utils/excel-export';
import { useExtensionStore } from '@/utils/store';
import { t, type Lang } from '@/utils/i18n';
import { Check, ChevronDown, FileSpreadsheet, Table2 } from 'lucide-react';

type CreditCheckResult = {
  allowed: boolean;
  remaining?: number;
  isLoggedIn: boolean;
  reason?: string;
};

async function requestCheckAndConsume(): Promise<CreditCheckResult> {
  const result = await safeSendRuntimeMessage<CreditCheckResult>({
    type: 'CHECK_AND_CONSUME',
  });
  return result ?? { allowed: false, reason: 'error', isLoggedIn: false };
}

function openLoginPage() {
  void safeSendRuntimeMessage({ type: 'OPEN_LOGIN' });
}

function openPaymentPage(lang: Lang) {
  void safeSendRuntimeMessage({
    type: 'OPEN_PAYMENT_PAGE',
    payload: { lang },
  });
}

interface FloatingButton {
  visible: boolean;
  x: number;
  y: number;
  table: ParsedTable | null;
}

const FAB_SIZE = 38;
const FAB_MARGIN = 12;
const HEADER_OFFSET = 4;
const palette = {
  ink: '#173127',
  muted: '#557064',
  faint: '#6d8277',
  primary: '#1f966b',
  primaryDark: '#1d7858',
  primarySoft: '#d9f5e8',
  cream: '#fffdf7',
  line: '#d9e7d8',
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getVisibleFabX(bounds: { left: number; right: number }) {
  const viewportLeft = 0;
  const viewportRight = window.innerWidth;
  const visibleLeft = Math.max(bounds.left, viewportLeft);
  const visibleRight = Math.min(bounds.right, viewportRight);

  // When a wide table overflows horizontally, anchor the button to the
  // visible portion instead of the table's absolute right edge.
  const anchorRight = visibleRight > visibleLeft ? visibleRight : viewportRight;
  const minX = FAB_MARGIN;
  const maxX = Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN);

  return clamp(anchorRight - FAB_SIZE - FAB_MARGIN, minX, maxX);
}

export default function TableOverlay() {
  const isEnabled = useExtensionStore((s) => s.isEnabled);
  const lang = useExtensionStore((s) => s.lang);
  const [contextValid, setContextValid] = useState(() => isExtensionContextValid());
  const [fab, setFab] = useState<FloatingButton>({
    visible: false,
    x: 0,
    y: 0,
    table: null,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fabRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  // Load saved lang preference and watch for changes made in the popup
  useEffect(() => {
    if (!isExtensionContextValid()) {
      setContextValid(false);
      return;
    }

    useExtensionStore.getState().initLang();
    const handler = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes.se_lang?.newValue) {
        useExtensionStore.setState({ lang: changes.se_lang.newValue as Lang });
      }
    };
    return safeAddStorageChangedListener(handler);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const valid = isExtensionContextValid();
      setContextValid(valid);
      if (!valid) {
        setMenuOpen(false);
        setFab((prev) => ({ ...prev, visible: false }));
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleToastEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) {
        showToast(detail.message);
      }
    };

    window.addEventListener('smartexcel:toast', handleToastEvent as EventListener);
    return () => {
      window.removeEventListener('smartexcel:toast', handleToastEvent as EventListener);
    };
  }, [showToast]);

  useEffect(() => {
    if (!isEnabled || !contextValid) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const hoveredTable = findClosestTableElement(target);
      if (!hoveredTable) return;

      const table = getLogicalTable(hoveredTable);

      clearTimeout(hideTimer.current);

      const rect = getLogicalTableBounds(table);
      const parsed = parseTable(table);
      if (parsed.rowCount === 0 && parsed.headers.length === 0) return;

      const minX = FAB_MARGIN;
      const minY = FAB_MARGIN;
      const maxY = Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN);

      setFab({
        visible: true,
        x: getVisibleFabX(rect),
        y: clamp(rect.top + HEADER_OFFSET, minY, maxY),
        table: parsed,
      });
    };

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (findClosestTableElement(related)) return;
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
      if (!fab.table || !isExtensionContextValid()) {
        setContextValid(false);
        setMenuOpen(false);
        setFab((prev) => ({ ...prev, visible: false }));
        return;
      }
      setMenuOpen(false);

      // 向后台请求积分检查并扣除
      const result = await requestCheckAndConsume();

      if (!result.allowed) {
        if (result.reason === 'not_logged_in') {
          showToast(t('loginRequiredToExport', lang));
          openLoginPage();
          return;
        }

        openPaymentPage(lang);
        return;
      }

      try {
        exportToExcel(fab.table, { format, withIndex: false });
        const fmt = format.toUpperCase();
        const hint = result.remaining !== undefined
          ? t('creditsLeft', lang, { n: result.remaining })
          : '';
        showToast(t('exportedAs', lang, { fmt }) + hint);
      } catch {
        showToast(t('exportFailed', lang));
      }
    },
    [fab.table, lang, showToast],
  );

  if (!fab.visible || !isEnabled || !contextValid) return null;

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
            width: `${FAB_SIZE}px`,
            height: `${FAB_SIZE}px`,
            borderRadius: '12px',
            background:
              'linear-gradient(135deg, #2ab37f 0%, #1f966b 100%)',
            border: '1px solid rgba(255,255,255,0.75)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow:
              '0 18px 38px -18px rgba(24,79,62,0.58), 0 0 0 4px rgba(217,245,232,0.82)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            pointerEvents: 'auto',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px) scale(1.08)';
            e.currentTarget.style.boxShadow =
              '0 24px 44px -18px rgba(24,79,62,0.68), 0 0 0 5px rgba(217,245,232,0.95)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow =
              '0 18px 38px -18px rgba(24,79,62,0.58), 0 0 0 4px rgba(217,245,232,0.82)';
          }}
          title={t('exportTableTitle', lang)}
        >
          <FileSpreadsheet size={19} color="#fff" strokeWidth={2.3} />
        </button>

        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '46px',
              right: '0',
              width: '238px',
              background:
                'linear-gradient(180deg, rgba(255,253,247,0.98) 0%, rgba(255,255,255,0.98) 100%)',
              borderRadius: '14px',
              boxShadow:
                '0 28px 78px -42px rgba(24,79,62,0.45), 0 10px 24px -18px rgba(24,79,62,0.24)',
              border: `1px solid ${palette.line}`,
              overflow: 'hidden',
              animation: 'smartexcel-fadein 0.15s ease',
              pointerEvents: 'auto',
              fontFamily:
                'Aptos, "Segoe UI Variable", "Segoe UI", Inter, system-ui, -apple-system, sans-serif',
            }}
          >
            {/* Table info */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              padding: '12px 14px',
              backgroundColor: '#f1fbf6',
              borderBottom: `1px solid ${palette.line}`,
              fontSize: '12px',
              color: palette.muted,
            }}>
              <span style={{
                width: '26px',
                height: '26px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#fff',
                color: palette.primary,
                boxShadow: '0 8px 18px -14px rgba(24,79,62,0.42)',
              }}>
                <Table2 size={15} />
              </span>
              <span style={{ fontWeight: 600 }}>
                {fab.table ? t('rowsCols', lang, { r: fab.table.rowCount, c: fab.table.colCount }) : ''}
              </span>
            </div>

            <MenuItem
              icon={<FileSpreadsheet size={16} />}
              label={t('exportAsExcel', lang)}
              sublabel=".xlsx"
              primary
              onClick={() => handleExport('xlsx')}
            />
            <MenuItem
              icon={<Table2 size={16} />}
              label={t('exportAsCsv', lang)}
              sublabel=".csv"
              onClick={() => handleExport('csv')}
            />
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: '8px',
          backgroundColor: palette.ink, color: '#fff', padding: '10px 18px',
          borderRadius: '12px', fontSize: '13px', boxShadow: '0 24px 54px -34px rgba(24,79,62,0.58)',
          zIndex: 2147483647, animation: 'smartexcel-fadein 0.2s ease',
          pointerEvents: 'auto', fontFamily: 'Aptos, "Segoe UI Variable", "Segoe UI", Inter, system-ui, -apple-system, sans-serif',
          whiteSpace: 'nowrap',
        }}>
          <Check size={15} color="#82dbb9" strokeWidth={2.4} />
          <span>{toast}</span>
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

function MenuItem({ icon, label, sublabel, primary, onClick }: {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px', backgroundColor: 'transparent', border: 'none',
        cursor: 'pointer', fontSize: '13px', color: palette.ink,
        transition: 'background-color 0.12s', textAlign: 'left',
        fontFamily: 'Aptos, "Segoe UI Variable", "Segoe UI", Inter, system-ui, -apple-system, sans-serif',
        pointerEvents: 'auto',
      }}
      onMouseOver={(e) => { e.currentTarget.style.backgroundColor = primary ? '#d9f5e8' : '#f1fbf6'; }}
      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <span
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? palette.primarySoft : '#fffdf7',
          color: primary ? palette.primaryDark : palette.muted,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, fontWeight: 600 }}>{label}</span>
      {sublabel && <span style={{ fontSize: '11px', color: palette.faint }}>{sublabel}</span>}
      <ChevronDown size={13} color={palette.faint} style={{ transform: 'rotate(-90deg)' }} />
    </button>
  );
}
