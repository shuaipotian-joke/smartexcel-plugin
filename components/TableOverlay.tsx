import { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
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
import { SHOW_TABLE_ICON_KEY, useExtensionStore } from '@/utils/store';
import { t, type Lang } from '@/utils/i18n';
import type { ExportAccessResult } from '@/utils/messaging';
import { theme } from '@/utils/theme';
import { useActivationForm } from '@/utils/use-activation';
import { PaymentQrPanel } from '@/components/PaymentQrPanel';
import type { ActivationState } from '@/utils/activation';
import { ChevronRight, FileSpreadsheet, KeyRound, Table2, X } from 'lucide-react';

/** Window event the content script fires to open the activation prompt. */
export const ACTIVATION_PROMPT_EVENT = 'smartexcel:activation-prompt';

async function requestExportAccess(): Promise<ExportAccessResult> {
  const result = await safeSendRuntimeMessage<ExportAccessResult>({
    type: 'CHECK_EXPORT_ACCESS',
  });
  return result ?? { allowed: false, reason: 'not_activated' };
}

interface FloatingButton {
  visible: boolean;
  x: number;
  y: number;
  table: ParsedTable | null;
}

type PendingExport = { table: ParsedTable; format: 'xlsx' | 'csv' };

const FAB_SIZE = 36;
const FAB_MARGIN = 12;
const HEADER_OFFSET = 4;

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
  const showTableIcon = useExtensionStore((s) => s.showTableIcon);
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
  const [promptOpen, setPromptOpen] = useState(false);
  const pendingExport = useRef<PendingExport | null>(null);
  const promptOpenRef = useRef(false);
  promptOpenRef.current = promptOpen;
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fabRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  // Follow language and table-icon changes made in the popup, on every open page.
  useEffect(() => {
    if (!isExtensionContextValid()) {
      setContextValid(false);
      return;
    }

    const handler = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes.se_lang?.newValue) {
        useExtensionStore.setState({ lang: changes.se_lang.newValue as Lang });
      }
      if (changes[SHOW_TABLE_ICON_KEY]) {
        useExtensionStore.setState({
          showTableIcon: changes[SHOW_TABLE_ICON_KEY].newValue !== false,
        });
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
        setPromptOpen(false);
        setFab((prev) => ({ ...prev, visible: false }));
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const openPrompt = () => {
      pendingExport.current = null;
      setPromptOpen(true);
    };
    window.addEventListener(ACTIVATION_PROMPT_EVENT, openPrompt);
    return () => window.removeEventListener(ACTIVATION_PROMPT_EVENT, openPrompt);
  }, []);

  useEffect(() => {
    if (!showTableIcon) {
      setMenuOpen(false);
      setFab((prev) => ({ ...prev, visible: false }));
    }
  }, [showTableIcon]);

  useEffect(() => {
    if (!showTableIcon || !contextValid) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const hoveredTable = findClosestTableElement(target);
      if (!hoveredTable) return;

      const table = getLogicalTable(hoveredTable);

      clearTimeout(hideTimer.current);

      const rect = getLogicalTableBounds(table);
      const parsed = parseTable(table);
      if (parsed.rowCount === 0 && parsed.headers.length === 0) return;

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
  }, [menuOpen, showTableIcon, contextValid, fab.visible]);

  const runExport = useCallback(
    ({ table, format }: PendingExport) => {
      try {
        exportToExcel(table, { format, withIndex: false });
        showToast(t('exportedAs', lang, { fmt: format.toUpperCase() }));
      } catch {
        showToast(t('exportFailed', lang));
      }
    },
    [lang, showToast],
  );

  const handleExport = useCallback(
    async (format: 'xlsx' | 'csv') => {
      if (!fab.table || !isExtensionContextValid()) {
        setContextValid(false);
        setMenuOpen(false);
        setFab((prev) => ({ ...prev, visible: false }));
        return;
      }
      setMenuOpen(false);

      const request = { table: fab.table, format };
      const result = await requestExportAccess();
      if (!result.allowed) {
        pendingExport.current = request;
        setPromptOpen(true);
        return;
      }
      runExport(request);
    },
    [fab.table, runExport],
  );

  const handleActivated = useCallback((alreadyActivated = false) => {
    // The form and the storage listener can both report one activation.
    if (!promptOpenRef.current) return;
    promptOpenRef.current = false;
    setPromptOpen(false);
    const pending = pendingExport.current;
    pendingExport.current = null;
    if (pending) {
      runExport(pending);
    } else {
      showToast(t(alreadyActivated ? 'alreadyActivated' : 'activationSuccess', lang));
    }
  }, [lang, runExport, showToast]);

  // Activated without the code form (paid in another tab): close the prompt
  // and finish the blocked export. A code activation also writes the code
  // hint and is handled by the form itself; the short delay lets the form's
  // answer (which knows "already activated") arrive first.
  useEffect(() => {
    if (!isExtensionContextValid()) return;
    const handler = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>) => {
      const activated = changes.se_activated;
      if (
        activated?.newValue === true &&
        activated.oldValue !== true &&
        !changes.se_activation_code_hint &&
        promptOpenRef.current
      ) {
        setTimeout(() => handleActivated(), 1000);
      }
    };
    return safeAddStorageChangedListener(handler);
  }, [handleActivated]);

  if (!contextValid) return null;

  const fabShown = fab.visible && showTableIcon;

  return (
    <>
      {fabShown && (
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
              borderRadius: '10px',
              background: theme.accent,
              border: `1px solid ${theme.accentHover}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: theme.shadow,
              transition: 'background-color 0.15s ease, transform 0.15s ease',
              pointerEvents: 'auto',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = theme.accentHover;
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = theme.accent;
              e.currentTarget.style.transform = 'none';
            }}
            title={t('exportTableTitle', lang)}
          >
            <FileSpreadsheet size={18} color="#fff" strokeWidth={2} />
          </button>

          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: `${FAB_SIZE + 8}px`,
                right: '0',
                width: '236px',
                background: theme.paper,
                borderRadius: '14px',
                boxShadow: theme.shadowLift,
                border: `1px solid ${theme.line}`,
                overflow: 'hidden',
                animation: 'smartexcel-fadein 0.15s ease',
                pointerEvents: 'auto',
                fontFamily: theme.fontSans,
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                borderBottom: `1px solid ${theme.line}`,
                fontSize: '12px',
                color: theme.muted,
              }}>
                <Table2 size={14} color={theme.faint} />
                <span>
                  {fab.table ? t('rowsCols', lang, { r: fab.table.rowCount, c: fab.table.colCount }) : ''}
                </span>
              </div>

              <div style={{ padding: '6px' }}>
                <MenuItem
                  icon={<FileSpreadsheet size={15} />}
                  label={t('exportAsExcel', lang)}
                  sublabel=".xlsx"
                  primary
                  onClick={() => handleExport('xlsx')}
                />
                <MenuItem
                  icon={<Table2 size={15} />}
                  label={t('exportAsCsv', lang)}
                  sublabel=".csv"
                  onClick={() => handleExport('csv')}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {promptOpen && (
        <ActivationPrompt
          lang={lang}
          onClose={() => {
            pendingExport.current = null;
            setPromptOpen(false);
          }}
          onActivated={(_state, alreadyActivated) => handleActivated(alreadyActivated)}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: theme.ink, color: theme.paper, padding: '10px 18px',
          borderRadius: '12px', fontSize: '13px', lineHeight: 1.4, boxShadow: theme.shadowLift,
          zIndex: 2147483647, animation: 'smartexcel-fadein 0.2s ease',
          pointerEvents: 'auto', fontFamily: theme.fontSans,
          whiteSpace: 'nowrap',
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
        padding: '9px 10px', backgroundColor: 'transparent', border: 'none',
        borderRadius: '10px', cursor: 'pointer', fontSize: '13px', color: theme.ink,
        transition: 'background-color 0.12s', textAlign: 'left',
        fontFamily: theme.fontSans, pointerEvents: 'auto',
      }}
      onMouseOver={(e) => { e.currentTarget.style.backgroundColor = theme.subtle; }}
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
          backgroundColor: primary ? theme.accentSoft : theme.subtle,
          color: primary ? theme.accent : theme.muted,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, fontWeight: 500 }}>{label}</span>
      {sublabel && <span style={{ fontSize: '11px', color: theme.faint }}>{sublabel}</span>}
      <ChevronRight size={13} color={theme.faint} />
    </button>
  );
}

/** In-page "Enter activation code" card shown when an export is blocked. */
function ActivationPrompt({ lang, onClose, onActivated }: {
  lang: Lang;
  onClose: () => void;
  onActivated: (state: ActivationState, alreadyActivated: boolean) => void;
}) {
  const { code, setCode, busy, error, submit } = useActivationForm(lang, onActivated);
  const inputRef = useRef<HTMLInputElement>(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!buying) inputRef.current?.focus();
  }, [buying]);

  const buttonBase: CSSProperties = {
    height: '38px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: theme.fontSans,
    cursor: 'pointer',
    padding: '0 16px',
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('activationTitle', lang)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
      style={{
        position: 'fixed',
        right: '24px',
        bottom: '24px',
        width: '340px',
        boxSizing: 'border-box',
        padding: '22px 22px 20px',
        background: theme.paper,
        border: `1px solid ${theme.line}`,
        borderRadius: '18px',
        boxShadow: theme.shadowLift,
        zIndex: 2147483647,
        pointerEvents: 'auto',
        fontFamily: theme.fontSans,
        color: theme.text,
        animation: 'smartexcel-fadein 0.18s ease',
      }}
    >
      <button
        onClick={onClose}
        title={t('close', lang)}
        aria-label={t('close', lang)}
        style={{
          position: 'absolute', top: '14px', right: '14px', width: '28px', height: '28px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', borderRadius: '8px', background: 'transparent',
          color: theme.faint, cursor: 'pointer',
        }}
      >
        <X size={16} />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{
          width: '30px', height: '30px', borderRadius: '9px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: theme.accentSoft, color: theme.accent,
        }}>
          <KeyRound size={16} />
        </span>
        <h2 style={{
          margin: 0, fontFamily: theme.fontSerif, fontSize: '19px', fontWeight: 500,
          color: theme.ink, letterSpacing: '-0.01em',
        }}>
          {t('activationRequired', lang)}
        </h2>
      </div>
      {buying ? (
        <div style={{ marginTop: '14px' }}>
          <PaymentQrPanel lang={lang} onHaveCode={() => setBuying(false)} />
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 16px', fontSize: '13px', lineHeight: 1.6, color: theme.muted }}>
            {t('activationIntro', lang)}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            style={{ display: 'flex', gap: '8px' }}
          >
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('activationCodePlaceholder', lang)}
              spellCheck={false}
              autoComplete="off"
              style={{
                flex: 1, minWidth: 0, height: '38px', boxSizing: 'border-box',
                padding: '0 12px', borderRadius: '10px', fontSize: '13px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                letterSpacing: '0.04em', textTransform: 'uppercase',
                color: theme.ink, background: theme.surface, outline: 'none',
                border: `1px solid ${error ? theme.danger : theme.lineStrong}`,
              }}
            />
            <button
              type="submit"
              disabled={busy}
              style={{
                ...buttonBase,
                border: 'none',
                background: busy ? theme.faint : theme.accent,
                color: '#fff',
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              {busy ? t('activating', lang) : t('activateButton', lang)}
            </button>
          </form>

          {error && (
            <p role="alert" style={{ margin: '10px 0 0', fontSize: '12px', lineHeight: 1.5, color: theme.danger }}>
              {error}
            </p>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            marginTop: '18px', paddingTop: '14px', borderTop: `1px solid ${theme.line}`,
          }}>
            <span style={{ fontSize: '12px', color: theme.muted }}>{t('noCodeYet', lang)}</span>
            <button
              onClick={() => setBuying(true)}
              style={{
                ...buttonBase,
                height: '32px',
                padding: '0 12px',
                border: `1px solid ${theme.lineStrong}`,
                background: theme.surface,
                color: theme.ink,
              }}
            >
              {t('buyActivation', lang)}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
