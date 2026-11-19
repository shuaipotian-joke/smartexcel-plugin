import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { encode } from 'uqr';
import { t, type Lang, type TranslationKey } from '@/utils/i18n';
import { theme } from '@/utils/theme';
import { usePaymentQr } from '@/utils/use-payment-qr';
import type { PaymentPayType, PaymentQrError } from '@/utils/activation';

const QR_SIZE = 176;

const ERROR_KEYS: Record<PaymentQrError, TranslationKey> = {
  network_error: 'payErrNetwork',
  server_error: 'payErrServer',
  rate_limited: 'payErrRateLimited',
};

/** The QR drawn locally from the raw XorPay string: one SVG path, no image. */
function QrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, size: qr.size };
  }, [value]);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={QR_SIZE}
      height={QR_SIZE}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      style={{ display: 'block' }}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill={theme.ink} />
    </svg>
  );
}

/**
 * Buy view of the activation card (popup and in-page prompt): ¥9.9, a WeChat
 * Pay / Alipay switch and the QR. Mounting it creates the order; the card
 * unlocks by itself once the payment arrives. Inline styles so it works in
 * the overlay's shadow root as well as in the popup.
 */
export function PaymentQrPanel({ lang, onHaveCode }: { lang: Lang; onHaveCode: () => void }) {
  const { payType, setPayType, phase, order, error, retry } = usePaymentQr();

  const tab = (type: PaymentPayType): CSSProperties => ({
    flex: 1,
    height: '30px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: theme.fontSans,
    cursor: 'pointer',
    background: payType === type ? theme.surface : 'transparent',
    color: payType === type ? theme.ink : theme.muted,
    boxShadow: payType === type ? '0 1px 2px rgba(31,30,27,0.08)' : 'none',
  });

  let status: string;
  if (phase === 'loading') status = t('payLoading', lang);
  else if (phase === 'paid') status = t('payPaid', lang);
  else if (phase === 'error') status = t(ERROR_KEYS[error ?? 'server_error'], lang);
  else status = t(payType === 'alipay' ? 'payScanAlipay' : 'payScanWechat', lang);

  return (
    <div style={{ fontFamily: theme.fontSans, color: theme.text }} data-testid="payment-qr-panel">
      <div style={{ fontFamily: theme.fontSerif, fontSize: '17px', fontWeight: 500, color: theme.ink }}>
        {t('payTitle', lang)}
      </div>
      <div style={{ marginTop: '2px', fontSize: '12px', color: theme.muted }}>{t('payOneTime', lang)}</div>

      <div
        role="tablist"
        style={{
          display: 'flex', gap: '4px', padding: '3px', margin: '12px 0',
          borderRadius: '10px', background: theme.subtle,
        }}
      >
        {(['native', 'alipay'] as const).map((type) => {
          const label = t(type === 'alipay' ? 'payAlipay' : 'payWechat', lang);
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={payType === type}
              onClick={() => setPayType(type)}
              style={tab(type)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <div
          data-testid="payment-qr"
          data-phase={phase}
          style={{
            width: `${QR_SIZE + 16}px`, height: `${QR_SIZE + 16}px`, boxSizing: 'border-box',
            padding: '8px', borderRadius: '14px', background: theme.surface,
            border: `1px solid ${theme.line}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {phase === 'ready' && order ? (
            <QrCode value={order.qrContent} label={t('payQrAlt', lang)} />
          ) : phase === 'error' ? (
            <button
              type="button"
              onClick={retry}
              style={{
                height: '34px', padding: '0 16px', borderRadius: '10px', border: 'none',
                background: theme.accent, color: '#fff', fontSize: '13px', fontWeight: 500,
                fontFamily: theme.fontSans, cursor: 'pointer',
              }}
            >
              {t('payRetry', lang)}
            </button>
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: `${QR_SIZE}px`, height: `${QR_SIZE}px`, borderRadius: '8px',
                background: `repeating-linear-gradient(45deg, ${theme.subtle} 0 8px, ${theme.paper} 8px 16px)`,
                opacity: phase === 'paid' ? 0.5 : 1,
              }}
            />
          )}
        </div>
        <p
          role={phase === 'error' ? 'alert' : 'status'}
          style={{
            margin: 0, fontSize: '12px', lineHeight: 1.5, textAlign: 'center',
            color: phase === 'error' ? theme.danger : phase === 'paid' ? theme.success : theme.ink,
          }}
        >
          {status}
        </p>
        {phase === 'ready' && (
          <p style={{ margin: '-6px 0 0', fontSize: '11px', color: theme.muted, textAlign: 'center' }}>
            {t('payWaiting', lang)}
          </p>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${theme.line}`,
      }}>
        <span style={{ fontSize: '12px', color: theme.muted }}>{t('haveCode', lang)}</span>
        <button
          type="button"
          onClick={onHaveCode}
          style={{
            height: '30px', padding: '0 12px', borderRadius: '10px',
            border: `1px solid ${theme.lineStrong}`, background: theme.surface, color: theme.ink,
            fontSize: '12px', fontWeight: 500, fontFamily: theme.fontSans, cursor: 'pointer',
          }}
        >
          {t('enterCode', lang)}
        </button>
      </div>
    </div>
  );
}
