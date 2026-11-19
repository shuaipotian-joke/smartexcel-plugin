import { useCallback, useEffect, useRef, useState } from 'react';
import { safeSendRuntimeMessage } from './extension-runtime';
import type { PaymentPayType, PaymentQrError, PaymentQrOrder, PaymentQrResult } from './activation';

/** Ask the server whether the order was paid this often while the QR shows. */
const PAYMENT_POLL_MS = 2 * 1000;

export type PaymentQrPhase = 'loading' | 'ready' | 'error' | 'paid';

/**
 * In-extension purchase, shared by the popup and the in-page prompt. Mount it
 * when the user clicks Buy: it asks the background for a XorPay order at
 * once (CREATE_PAYMENT_QR), polls the activation status every ~2 s while the
 * QR shows (CHECK_PAYMENT_STATUS), and fetches a new QR when the old one
 * expires. Unmounting stops everything. Popup and overlay unlock through the
 * storage change the status check writes.
 */
export function usePaymentQr() {
  const [payType, setPayType] = useState<PaymentPayType>('native');
  const [phase, setPhase] = useState<PaymentQrPhase>('loading');
  const [order, setOrder] = useState<PaymentQrOrder | null>(null);
  const [error, setError] = useState<PaymentQrError | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (type: PaymentPayType) => {
    const id = ++requestId.current;
    setPhase('loading');
    setOrder(null);
    setError(null);
    const result = await safeSendRuntimeMessage<PaymentQrResult>({
      type: 'CREATE_PAYMENT_QR',
      payload: { payType: type },
    });
    if (id !== requestId.current) return; // a newer request or unmounted
    if (result?.ok) {
      setOrder(result.order);
      setPhase('ready');
    } else {
      setError(result ? result.error : 'network_error');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load(payType);
  }, [load, payType]);

  // Invalidate answers that arrive after unmount.
  useEffect(() => () => void ++requestId.current, []);

  // An expired QR is replaced without a click.
  useEffect(() => {
    if (phase !== 'ready' || !order) return;
    const left = Date.parse(order.expiresAt) - Date.now();
    const timer = window.setTimeout(() => void load(order.payType), Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [phase, order, load]);

  useEffect(() => {
    if (phase !== 'ready') return;
    let stopped = false;
    let busy = false;
    const timer = window.setInterval(async () => {
      if (busy) return;
      busy = true;
      const result = await safeSendRuntimeMessage<{ activated: boolean }>({
        type: 'CHECK_PAYMENT_STATUS',
      });
      busy = false;
      if (!stopped && result?.activated) setPhase('paid');
    }, PAYMENT_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [phase]);

  const retry = useCallback(() => void load(payType), [load, payType]);

  return { payType, setPayType, phase, order, error, retry };
}
