import { t, LANG_LABELS, SUPPORTED_LANGS, type Lang } from '@/utils/i18n';
import { ArrowLeft, Check, Globe2, LogIn, UserRound } from 'lucide-react';

interface PluginAccess {
  licensed: boolean;
  member: boolean;
  plan: string;
  trialRemaining: number;
  trialLimit: number;
  allowed: boolean;
}

interface CreditState {
  credits: number;
  loggedIn: boolean;
  freeLimit: number;
  pluginAccess?: PluginAccess;
  email?: string;
  name?: string;
}

interface SettingsPanelProps {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onBack: () => void;
  creditState: CreditState | null;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
}

export default function SettingsPanel({
  lang,
  onLangChange,
  onBack,
  creditState,
  onLogin,
  onRegister,
  onLogout,
}: SettingsPanelProps) {
  return (
    <div className="w-[380px] min-h-[260px] overflow-hidden bg-cream-50 text-[#173127]">
      {/* Header */}
      <div className="border-b border-cream-200 bg-[radial-gradient(circle_at_top_left,rgba(42,179,127,0.18),transparent_36%),linear-gradient(135deg,#fffdf7_0%,#f1fbf6_100%)] px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d9e7d8] bg-white/80 text-[#557064] shadow-sm transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            title={t('back', lang)}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[#173127]">{t('settings', lang)}</h1>
            <p className="mt-0.5 text-xs text-[#557064]">SmartExcel</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Language section */}
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#557064]">
            <Globe2 className="h-3.5 w-3.5 text-brand-600" />
            <span>{t('language', lang)}</span>
          </p>
          <p className="mb-2 text-xs leading-relaxed text-[#6d8277]">
            {t('languageRegionHint', lang)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_LANGS.map((l) => (
              <button
                key={l}
                onClick={() => onLangChange(l)}
                className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors ${
                  lang === l
                    ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                    : 'border-[#d9e7d8] bg-white/80 text-[#557064] hover:bg-brand-50 hover:text-brand-700'
                }`}
              >
                {lang === l && <Check className="h-3.5 w-3.5" />}
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        {/* Usage stats section */}
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#557064]">
            <UserRound className="h-3.5 w-3.5 text-brand-600" />
            <span>{t('usageStats', lang)}</span>
          </p>
          <div className="space-y-2.5 rounded-xl border border-[#e5eadf] bg-white/85 p-3 shadow-soft">
            {creditState ? (
              <>
                {creditState.loggedIn ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="shrink-0 text-sm text-[#557064]">{t('pluginStatus', lang)}</span>
                      <span className="min-w-0 break-words text-right rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
                        {creditState.pluginAccess?.licensed
                          ? t('accessUnlocked', lang)
                          : creditState.pluginAccess?.member
                            ? t('accessMember', lang)
                            : (creditState.pluginAccess?.trialRemaining ?? 0) > 0
                              ? t('accessTrial', lang, {
                                  n: creditState.pluginAccess?.trialRemaining ?? 0,
                                })
                              : t('accessExhausted', lang)}
                      </span>
                    </div>
                    <div className="space-y-2 pt-1">
                      <div className="break-all text-xs leading-relaxed text-[#6d8277]">
                        {t('loggedInAs', lang, {
                          email: creditState.email || creditState.name || '—',
                        })}
                      </div>
                      <button
                        onClick={onLogout}
                        className="text-xs font-medium text-red-500 hover:underline"
                      >
                        {t('logout', lang)}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#557064]">{t('loginRequiredToExport', lang)}</span>
                      <button
                        onClick={onLogin}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                      >
                        <LogIn className="h-3 w-3" />
                        {t('login', lang)}
                      </button>
                    </div>
                    <p className="text-xs leading-relaxed text-[#6d8277]">
                      {t('signupBonusHint', lang, { n: creditState.freeLimit })}
                    </p>
                    <button
                      onClick={onRegister}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >
                      {t('createAccountForBonus', lang, { n: creditState.freeLimit })}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-[#8a9a92] text-center py-1">—</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
