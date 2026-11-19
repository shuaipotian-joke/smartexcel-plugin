import { useCallback, useEffect, useRef, useState } from 'react';
import { isExtensionContextValid, safeSendRuntimeMessage } from './extension-runtime';
import type { PaymentPayType, PaymentQrError, PaymentQrOrder, PaymentQrResult } from './activation';
import {
  PAYMENT_WAIT_PORT,
  type PaymentWaitPortEvent,
  type PaymentWaitPortMessage,
} from './messaging';

/** Stop waiting (and refreshing the QR) this long after the last click. */
const PAYMENT_WAIT_CAP_MS = 15 * 60 * 1000;
/** Keeps the background service worker alive while it holds a request. */
const PAYMENT_WAIT_PING_MS = 20 * 1000;
/** Reconnect after the worker restarted under an open card. */
const PORT_RECONNECT_MS = 1000;

export type PaymentQrPhase = 'loading' | 'ready' | 'error' | 'paid';
/** `expired`: the 15-min cap passed; the retry button shows a new QR. */
export type PaymentQrPanelError = PaymentQrError | 'expired';

type Port = ReturnType<typeof browser.runtime.connect>;

/**
 * In-extension purchase, shared by the popup and the in-page prompt. Mount it
 * when the user clicks Buy: it asks the background for a XorPay order at
 * once (CREATE_PAYMENT_QR) and, while the QR shows, has the background
 * long-poll the website for that order (PAYMENT_WAIT_PORT: one request at a
 * time, each held ~25 s by the server). An expired QR is replaced without a
 * click until 15 min after the last click. Unmounting closes the port, which
 * stops the wait. Popup and overlay unlock through the storage change the
 * background writes.
 */
export function usePaymentQr() {
  const [payType, setPayTypeState] = useState<PaymentPayType>('native');
  const [phase, setPhase] = useState<PaymentQrPhase>('loading');
  const [order, setOrder] = useState<PaymentQrOrder | null>(null);
  const [error, setError] = useState<PaymentQrPanelError | null>(null);
  const requestId = useRef(0);
  const capStart = useRef(Date.now());
  const portRef = useRef<Port | null>(null);
  const watched = useRef<string | null>(null);
  const onPortEvent = useRef<(event: PaymentWaitPortEvent) => void>(() => undefined);

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

  /** The order ran out: a new QR, unless the cap since the last click passed. */
  const expire = useCallback(
    (type: PaymentPayType) => {
      if (Date.now() - capStart.current >= PAYMENT_WAIT_CAP_MS - 1000) {
        ++requestId.current;
        setOrder(null);
        setError('expired');
        setPhase('error');
      } else {
        void load(type);
      }
    },
    [load],
  );

  useEffect(() => {
    if (phase !== 'ready' || !order) return;
    const until = Math.min(Date.parse(order.expiresAt), capStart.current + PAYMENT_WAIT_CAP_MS);
    const timer = window.setTimeout(() => expire(order.payType), Math.max(0, until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [phase, order, expire]);

  useEffect(() => {
    onPortEvent.current = (event) => {
      if (!order || event.orderId !== order.orderId || phase !== 'ready') return;
      if (event.type === 'PAID') setPhase('paid');
      else expire(order.payType);
    };
  }, [order, phase, expire]);

  // One port for the panel's lifetime; the background aborts the wait and
  // checks the status once more when it disconnects.
  useEffect(() => {
    let closed = false;
    let reconnect = 0;
    const post = (message: PaymentWaitPortMessage) => {
      try {
        portRef.current?.postMessage(message);
      } catch {
        // Disconnected; onDisconnect reconnects.
      }
    };
    const connect = () => {
      if (closed || !isExtensionContextValid()) return;
      let port: Port;
      try {
        port = browser.runtime.connect({ name: PAYMENT_WAIT_PORT });
      } catch {
        return;
      }
      portRef.current = port;
      port.onMessage.addListener((event: unknown) =>
        onPortEvent.current(event as PaymentWaitPortEvent),
      );
      port.onDisconnect.addListener(() => {
        if (portRef.current === port) portRef.current = null;
        if (!closed) reconnect = window.setTimeout(connect, PORT_RECONNECT_MS);
      });
      if (watched.current) post({ type: 'WATCH', orderId: watched.current });
    };
    connect();
    const ping = window.setInterval(() => post({ type: 'PING' }), PAYMENT_WAIT_PING_MS);
    return () => {
      closed = true;
      window.clearTimeout(reconnect);
      window.clearInterval(ping);
      try {
        portRef.current?.disconnect();
      } catch {
        // Invalidated extension context.
      }
      portRef.current = null;
    };
  }, []);

  // Wait for the shown order only.
  useEffect(() => {
    const orderId = phase === 'ready' && order ? order.orderId : null;
    if (orderId === watched.current) return;
    watched.current = orderId;
    try {
      portRef.current?.postMessage(orderId ? { type: 'WATCH', orderId } : { type: 'IDLE' });
    } catch {
      // Disconnected; the reconnect sends WATCH.
    }
  }, [phase, order]);

  const setPayType = useCallback((type: PaymentPayType) => {
    capStart.current = Date.now();
    setPayTypeState(type);
  }, []);

  const retry = useCallback(() => {
    capStart.current = Date.now();
    void load(payType);
  }, [load, payType]);

  return { payType, setPayType, phase, order, error, retry };
}
