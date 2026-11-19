import { useState } from 'react';
import { t, LANG_LABELS, SUPPORTED_LANGS, type Lang } from '@/utils/i18n';
import type { ActivationState } from '@/utils/activation';
import { ArrowLeft, Check, Globe2, KeyRound, MousePointerClick } from 'lucide-react';

interface SettingsPanelProps {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onBack: () => void;
  activation: ActivationState | null;
  showTableIcon: boolean;
  onShowTableIconChange: (show: boolean) => void;
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 flex items-center gap-2 font-serif text-[15px] font-medium text-ink">
      <span className="text-clay">{icon}</span>
      {children}
    </h2>
  );
}

export default function SettingsPanel({
  lang,
  onLangChange,
  onBack,
  activation,
  showTableIcon,
  onShowTableIconChange,
}: SettingsPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyDeviceId = async () => {
    if (!activation?.deviceId) return;
    try {
      await navigator.clipboard.writeText(activation.deviceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable; the ID stays selectable.
    }
  };

  return (
    <div className="w-[380px] min-h-[280px] overflow-hidden bg-paper font-sans text-body">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
          title={t('back', lang)}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-serif text-lg font-medium tracking-tight text-ink">{t('settings', lang)}</h1>
      </div>

      <div className="space-y-6 p-5">
        {/* Page display */}
        <section>
          <SectionTitle icon={<MousePointerClick className="h-4 w-4" />}>
            {t('pageDisplay', lang)}
          </SectionTitle>
          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line bg-white p-3.5">
            <span className="min-w-0">
              <span className="block text-sm text-ink">{t('showTableIcon', lang)}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">
                {t('showTableIconHint', lang)}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={showTableIcon}
              onChange={(e) => onShowTableIconChange(e.target.checked)}
            />
            <span
              aria-hidden
              className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-clay/40 ${
                showTableIcon ? 'bg-clay' : 'bg-line-strong'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                  showTableIcon ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </span>
          </label>
        </section>

        {/* Language */}
        <section>
          <SectionTitle icon={<Globe2 className="h-4 w-4" />}>{t('language', lang)}</SectionTitle>
          <p className="mb-2.5 text-xs leading-relaxed text-muted">
            {t('languageRegionHint', lang)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_LANGS.map((l) => (
              <button
                key={l}
                onClick={() => onLangChange(l)}
                className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm transition-colors ${
                  lang === l
                    ? 'border-clay bg-clay-soft text-ink'
                    : 'border-line bg-white text-muted hover:bg-subtle hover:text-ink'
                }`}
              >
                {lang === l && <Check className="h-3.5 w-3.5 text-clay" />}
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
        </section>

        {/* Activation */}
        <section>
          <SectionTitle icon={<KeyRound className="h-4 w-4" />}>
            {t('activationSection', lang)}
          </SectionTitle>
          <div className="space-y-3 rounded-xl border border-line bg-white p-3.5">
            {activation ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      activation.activated
                        ? 'bg-[#eef2e8] text-success'
                        : 'bg-clay-soft text-clay'
                    }`}
                  >
                    {activation.activated ? t('statusActivated', lang) : t('statusNotActivated', lang)}
                  </span>
                  {activation.activated && activation.codeHint && (
                    <span className="text-xs text-muted">
                      {t('codeEnding', lang, { hint: activation.codeHint })}
                    </span>
                  )}
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-muted">{t('deviceIdLabel', lang)}</span>
                    <button
                      onClick={copyDeviceId}
                      className="text-xs text-clay hover:underline"
                    >
                      {copied ? t('copied', lang) : t('copy', lang)}
                    </button>
                  </div>
                  <code className="block select-all break-all rounded-lg bg-subtle px-2.5 py-1.5 font-mono text-[11px] text-body">
                    {activation.deviceId}
                  </code>
                </div>
              </>
            ) : (
              <p className="py-1 text-center text-sm text-faint">—</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
