import { useState, useEffect, useCallback, useRef } from 'react';
import type { ActivationState } from '@/utils/activation';
import type { ExportResult, TableInfo } from '@/utils/messaging';
import { useExtensionStore } from '@/utils/store';
import { t, type Lang } from '@/utils/i18n';
import { ensureContentScript } from '@/utils/ensure-content-script';
import { useActivationForm } from '@/utils/use-activation';
import { PaymentQrPanel } from '@/components/PaymentQrPanel';
import {
  CheckCircle2,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Settings,
  Table2,
} from 'lucide-react';
import SettingsPanel from './SettingsPanel';

const ACTIVATION_STORAGE_KEYS = ['se_activated', 'se_activated_at', 'se_activation_code_hint'];

async function sendToActiveTab(message: unknown): Promise<ExportResult | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !(await ensureContentScript(tab.id))) {
    return null;
  }
  return (await browser.tabs.sendMessage(tab.id, message)) as ExportResult;
}

export default function App() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activation, setActivation] = useState<ActivationState | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const codeInputRef = useRef<HTMLInputElement>(null);

  const lang = useExtensionStore((s) => s.lang);
  const setLang = useExtensionStore((s) => s.setLang);
  const showTableIcon = useExtensionStore((s) => s.showTableIcon);
  const setShowTableIcon = useExtensionStore((s) => s.setShowTableIcon);
  const initPrefs = useExtensionStore((s) => s.initPrefs);

  useEffect(() => {
    void initPrefs();
    void loadTables();
    void loadActivation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The background refreshes a stale activation after GET_STATE; follow it.
  useEffect(() => {
    const handleStorageChange = (changes: Record<string, unknown>) => {
      if (ACTIVATION_STORAGE_KEYS.some((key) => key in changes)) {
        void loadActivation();
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  async function loadTables() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        const isReady = await ensureContentScript(tab.id);
        if (!isReady) {
          setTables([]);
          return;
        }

        const result = await browser.tabs.sendMessage(tab.id, { type: 'GET_TABLES' });
        const nextTables = (result ?? []) as TableInfo[];
        setTables(nextTables);
        setSelectedTableIds(nextTables.map((table: TableInfo) => table.id));
      }
    } catch {
      setTables([]);
      setSelectedTableIds([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadActivation() {
    try {
      const state = (await browser.runtime.sendMessage({ type: 'GET_STATE' })) as ActivationState | null;
      if (state) {
        setActivation(state);
      }
    } catch {
      // ignore
    }
  }

  const handleExportResult = useCallback((result: ExportResult | null) => {
    if (result?.reason === 'not_activated') {
      setNotice(t('exportBlockedHint', lang));
      codeInputRef.current?.focus();
    }
  }, [lang]);

  const handleExportAll = useCallback(async () => {
    const targetIds = selectedTableIds.length > 0
      ? selectedTableIds
      : tables.map((table) => table.id);

    if (targetIds.length === 0) {
      return;
    }

    setNotice('');

    if (!activation?.activated) {
      handleExportResult({ ok: false, reason: 'not_activated' });
      return;
    }

    const confirmed = window.confirm(
      t('confirmExportAll', lang, { count: targetIds.length }),
    );
    if (!confirmed) {
      return;
    }

    handleExportResult(
      await sendToActiveTab({ type: 'EXPORT_ALL', payload: { tableIds: targetIds } }),
    );
  }, [activation?.activated, handleExportResult, lang, selectedTableIds, tables]);

  const handleExportTable = useCallback(async (tableId: string, format: 'xlsx' | 'csv') => {
    setNotice('');
    handleExportResult(
      await sendToActiveTab({ type: 'EXPORT_TABLE', payload: { tableId, format } }),
    );
  }, [handleExportResult]);

  const allSelected = tables.length > 0 && selectedTableIds.length === tables.length;

  const handleToggleAll = useCallback(() => {
    setSelectedTableIds((current) =>
      current.length === tables.length ? [] : tables.map((table) => table.id),
    );
  }, [tables]);

  const handleToggleTable = useCallback((tableId: string) => {
    setSelectedTableIds((current) =>
      current.includes(tableId)
        ? current.filter((id) => id !== tableId)
        : [...current, tableId],
    );
  }, []);

  const handleActivated = useCallback((state: ActivationState, alreadyActivated: boolean) => {
    setActivation(state);
    setNotice(alreadyActivated ? t('alreadyActivated', lang) : '');
  }, [lang]);

  if (showSettings) {
    return (
      <SettingsPanel
        lang={lang}
        onLangChange={setLang}
        onBack={() => setShowSettings(false)}
        activation={activation}
        showTableIcon={showTableIcon}
        onShowTableIconChange={setShowTableIcon}
      />
    );
  }

  return (
    <div className="w-[380px] min-h-[280px] overflow-hidden bg-paper font-sans text-body">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <img src="/icon-128.png" alt="" className="h-8 w-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-lg font-medium leading-tight tracking-tight text-ink">
            SmartExcel
          </h1>
          <p className="mt-0.5 text-xs text-muted">{t('appSubtitle', lang)}</p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
          title={t('settings', lang)}
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-5">
        {activation?.activated && notice && (
          <p role="status" className="text-xs leading-relaxed text-clay">{notice}</p>
        )}
        {activation && (
          activation.activated ? (
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <span className="flex-1 text-body">{t('activatedSince', lang)}</span>
              {activation.codeHint ? (
                <span className="shrink-0 font-mono text-[11px] text-faint">
                  ···{activation.codeHint}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-faint">
                  {t('activatedByPurchase', lang)}
                </span>
              )}
            </div>
          ) : (
            <ActivationCard
              lang={lang}
              inputRef={codeInputRef}
              notice={notice}
              onActivated={handleActivated}
            />
          )
        )}

        {/* Tables */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-clay" />
          </div>
        ) : tables.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center">
            <Table2 className="mx-auto mb-3 h-6 w-6 text-faint" />
            <p className="font-serif text-[15px] text-ink">{t('noTablesFound', lang)}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{t('hoverHint', lang)}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="mb-1 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <span className="block font-serif text-[15px] text-ink">
                  {t('tablesDetected', lang, { n: tables.length })}
                </span>
                <span className="block text-[11px] text-faint">
                  {t('selectedTables', lang, { n: selectedTableIds.length })}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  className="rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-subtle hover:text-ink"
                  onClick={handleToggleAll}
                >
                  {allSelected ? t('deselectAll', lang) : t('selectAll', lang)}
                </button>
                <button
                  className="rounded-lg bg-clay px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-clay-hover disabled:cursor-not-allowed disabled:bg-line-strong"
                  onClick={handleExportAll}
                  disabled={selectedTableIds.length === 0}
                >
                  {selectedTableIds.length === tables.length ? t('exportAll', lang) : t('exportSelected', lang)}
                </button>
              </div>
            </div>
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                lang={lang}
                selected={selectedTableIds.includes(table.id)}
                onToggleSelected={() => handleToggleTable(table.id)}
                onExport={(format) => handleExportTable(table.id, format)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivationCard({
  lang,
  inputRef,
  notice,
  onActivated,
}: {
  lang: Lang;
  inputRef: React.RefObject<HTMLInputElement | null>;
  notice: string;
  onActivated: (state: ActivationState, alreadyActivated: boolean) => void;
}) {
  const { code, setCode, busy, error, submit } = useActivationForm(lang, onActivated);
  const message = error || notice;
  const [buying, setBuying] = useState(false);

  if (buying) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
        <PaymentQrPanel lang={lang} onHaveCode={() => setBuying(false)} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-clay-soft text-clay">
          <KeyRound className="h-3.5 w-3.5" />
        </span>
        <h2 className="font-serif text-base font-medium text-ink">{t('activationTitle', lang)}</h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted">{t('activationIntro', lang)}</p>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('activationCodePlaceholder', lang)}
          spellCheck={false}
          autoComplete="off"
          className={`h-9 min-w-0 flex-1 rounded-lg border bg-paper px-3 font-mono text-[13px] uppercase tracking-wide text-ink outline-none transition-colors placeholder:normal-case placeholder:tracking-normal placeholder:text-faint focus:border-clay ${
            error ? 'border-danger' : 'border-line-strong'
          }`}
        />
        <button
          type="submit"
          disabled={busy}
          className="h-9 shrink-0 rounded-lg bg-clay px-4 text-[13px] font-medium text-white transition-colors hover:bg-clay-hover disabled:bg-faint"
        >
          {busy ? t('activating', lang) : t('activateButton', lang)}
        </button>
      </form>

      {message && (
        <p role="alert" className={`mt-2 text-xs leading-relaxed ${error ? 'text-danger' : 'text-clay'}`}>
          {message}
        </p>
      )}

      <div className="mt-3.5 flex items-center justify-between border-t border-line pt-3">
        <span className="text-xs text-muted">{t('noCodeYet', lang)}</span>
        <button
          onClick={() => setBuying(true)}
          className="rounded-lg border border-line-strong bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-subtle"
        >
          {t('buyActivation', lang)}
        </button>
      </div>
    </div>
  );
}

function TableCard({
  table,
  lang,
  selected,
  onToggleSelected,
  onExport,
}: {
  table: TableInfo;
  lang: Lang;
  selected: boolean;
  onToggleSelected: () => void;
  onExport: (format: 'xlsx' | 'csv') => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-3.5 transition-colors hover:border-line-strong">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-[#c96442]"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={t('selectTable', lang, { title: table.title })}
          />
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-clay" />
          <span className="max-w-[170px] truncate">{table.title}</span>
        </label>
        <span className="rounded-md bg-subtle px-2 py-0.5 text-[11px] text-muted">
          {table.rowCount}×{table.colCount}
        </span>
      </div>

      {table.headers.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1">
          {table.headers.slice(0, 4).map((h, i) => (
            <span key={i} className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">
              {h.length > 10 ? h.slice(0, 10) + '…' : h}
            </span>
          ))}
          {table.headers.length > 4 && (
            <span className="self-center text-[10px] text-faint">+{table.headers.length - 4}</span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onExport('xlsx')}
          className="flex-1 rounded-lg bg-clay py-1.5 text-xs font-medium text-white transition-colors hover:bg-clay-hover"
        >
          {t('exportExcel', lang)}
        </button>
        <button
          onClick={() => onExport('csv')}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-xs text-body transition-colors hover:bg-subtle"
        >
          {t('csvLabel', lang)}
        </button>
      </div>
    </div>
  );
}
