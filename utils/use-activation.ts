import { useCallback, useState } from 'react';
import { safeSendRuntimeMessage } from './extension-runtime';
import { activationErrorText, type Lang } from './i18n';
import type { ActivateResult, ActivationState } from './activation';

/**
 * Activation-code form state shared by the popup and the in-page prompt.
 * The request itself runs in the background worker (ACTIVATE message).
 */
export function useActivationForm(
  lang: Lang,
  onActivated?: (state: ActivationState) => void,
) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    if (busy) return;
    if (!code.trim()) {
      setError(activationErrorText('bad_request', lang));
      return;
    }
    setBusy(true);
    setError('');
    const result = await safeSendRuntimeMessage<ActivateResult>({
      type: 'ACTIVATE',
      payload: { code },
    });
    setBusy(false);
    if (result?.ok) {
      setCode('');
      onActivated?.(result.state);
      return;
    }
    setError(activationErrorText(result ? result.error : 'network_error', lang));
  }, [busy, code, lang, onActivated]);

  const updateCode = useCallback((value: string) => {
    setCode(value);
    setError('');
  }, []);

  return { code, setCode: updateCode, busy, error, submit };
}

export function openBuyPage(lang: Lang) {
  void safeSendRuntimeMessage({ type: 'OPEN_PAYMENT_PAGE', payload: { lang } });
}
