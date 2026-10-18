import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { PaymentApi } from '../payments/paymentApi';
import { usePaymentEvidenceStore } from '../payments/paymentEvidenceStore';
import { PaymentFlowController } from '../payments/paymentFlowController';
import { derivePresentation } from '../payments/paymentPresentation';
import { isNativeCheckoutOpen, isRazorpayNativeAvailable, onNativeCheckoutSettled, onNativeCheckoutStateChange, openCheckout } from '../payments/razorpayBridge';
import { CommerceApi } from './api';
import { useOrder } from './hooks';
import { qk } from './queryKeys';

/**
 * React wiring for the payment orchestrator of ONE order. It owns no financial state: the order comes from the shared order query (the
 * single order cache), the flow state from the controller, and the presentation is derived from both. Nothing here starts a payment on
 * mount; the caller must invoke startPayment() from an explicit user action. The controller is disposed (timers, lifecycle listeners,
 * stale async results) when the order changes or the screen unmounts, and sign-out unmounts the authenticated tree.
 */
export function usePaymentFlow(orderId: string) {
  const { manager } = useAuth();
  const queryClient = useQueryClient();
  const evidence = usePaymentEvidenceStore();
  const orderQuery = useOrder(orderId);

  const controller = useMemo(() => {
    const commerce = new CommerceApi(manager.api);
    return new PaymentFlowController({
      orderId,
      api: new PaymentApi(manager.api),
      evidence,
      openCheckout,
      isNativeAvailable: isRazorpayNativeAvailable,
      isCheckoutOpen: isNativeCheckoutOpen,
      onCheckoutSettled: onNativeCheckoutSettled,
      fetchOrder: async () => {
        const order = await queryClient.fetchQuery({ queryKey: qk.order(orderId), queryFn: () => commerce.order(orderId), staleTime: 0 });
        void queryClient.invalidateQueries({ queryKey: qk.orders });
        return order;
      },
      appState: {
        current: () => AppState.currentState,
        subscribe: (listener) => {
          const sub = AppState.addEventListener('change', listener);
          return () => sub.remove();
        }
      }
    });
  }, [manager, queryClient, evidence, orderId]);

  useEffect(() => () => controller.dispose(), [controller]);

  const order = orderQuery.data ?? null;
  useEffect(() => {
    if (order) controller.observe(order);
  }, [controller, order]);

  const flow = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  // The native lock is process-wide (another screen may hold it): read it live so Pay Now disappears the moment it is taken.
  const lockOpen = useSyncExternalStore(onNativeCheckoutStateChange, isNativeCheckoutOpen, isNativeCheckoutOpen);
  const nativeAvailable = isRazorpayNativeAvailable();
  const presentation = useMemo(
    () => derivePresentation(order, flow, controller.hasEvidence(), { lockOpen, nativeAvailable }),
    [order, flow, controller, lockOpen, nativeAvailable]
  );

  return {
    flow,
    presentation,
    startPayment: controller.startPayment.bind(controller),
    retryVerification: controller.retryVerification.bind(controller),
    checkPaymentStatus: controller.checkPaymentStatus.bind(controller)
  };
}
