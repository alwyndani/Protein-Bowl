import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatInr } from '../../commerce/money';
import { useCancelSubscription } from '../../mess/hooks';
import { refundCopy } from '../../mess/labels';
import { messMessage } from '../../mess/messErrors';
import { CANCEL_REASONS, type CancelReasonCode, type MessSubscription } from '../../mess/types';
import { Button, colors, Notice, TextField } from '../../ui/components';
import { Row } from '../../ui/commerceUi';
import { messStyles } from './messShared';

const NOTE_MAX = 400;

/** The refund as the server reports it. The amount is the server's total for a full refund; it is shown only when a refund exists. */
export function RefundSummary({ refundState, total }: { refundState: string | null | undefined; total: number | null | undefined }) {
  const hasRefund = !!refundState && refundState !== 'NO_REFUND';
  return (
    <View accessibilityLabel="Refund" style={messStyles.box}>
      <Text accessibilityRole="header" style={messStyles.heading}>
        Refund
      </Text>
      <Text style={styles.text}>{refundCopy(refundState)}</Text>
      {hasRefund ? <Row label="Refund amount" value={total === null || total === undefined ? 'Not provided' : formatInr(total)} strong /> : null}
    </View>
  );
}

/**
 * Cancel a subscription. Offered ONLY when the server says cancellation is allowed (`cancellation.allowed`); the server re-checks and may
 * still refuse (the message is shown and the subscription re-read). The refund shown afterwards is the server's answer, never computed here.
 */
export function CancelSubscriptionPanel({ subscription }: { subscription: MessSubscription }) {
  const cancel = useCancelSubscription(subscription.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancelReasonCode | null>(null);
  const [note, setNote] = useState('');
  const [reasonError, setReasonError] = useState(false);

  if (cancel.isSuccess) {
    const r = cancel.data;
    return (
      <View style={{ gap: 10 }}>
        <Notice tone="info">{r.alreadyCancelled ? 'This subscription was already cancelled.' : 'Your subscription was cancelled.'}</Notice>
        {/* Until the re-read lands, show the refund from the cancel answer; afterwards the screen shows the re-read subscription's own refund. */}
        {subscription.status !== 'CANCELLED' ? <RefundSummary refundState={r.refund?.state} total={subscription.price?.total} /> : null}
      </View>
    );
  }
  // The server withdrew the option (possibly because of the very refusal we just got): keep explaining the refusal, offer no form.
  if (!subscription.cancellation.allowed) return cancel.isError ? <Notice>{messMessage(cancel.error)}</Notice> : null;

  const confirm = () => {
    if (cancel.isPending) return;
    if (!reason) {
      setReasonError(true);
      return;
    }
    const n = note.replace(/\s+/g, ' ').trim();
    cancel.mutate({ reasonCode: reason, ...(n ? { note: n } : {}) });
  };

  if (!open) return <Button label="Cancel subscription" variant="secondary" onPress={() => setOpen(true)} />;

  return (
    <View style={messStyles.box} accessibilityLabel="Cancel subscription">
      <Text accessibilityRole="header" style={messStyles.heading}>
        Cancel this subscription?
      </Text>
      <Text style={styles.text}>The whole subscription is cancelled. If you have already paid, the full amount is refunded to your original payment method.</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Reason for cancelling" style={{ gap: 6 }}>
        {CANCEL_REASONS.map((r) => {
          const selected = reason === r.code;
          return (
            <Pressable
              key={r.code}
              accessibilityRole="radio"
              accessibilityLabel={r.label}
              accessibilityState={{ selected }}
              onPress={() => {
                setReason(r.code);
                setReasonError(false);
              }}
              style={[styles.option, selected && { borderColor: colors.accent }]}
            >
              <Text style={styles.text}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {reasonError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          Choose a reason.
        </Text>
      ) : null}
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={NOTE_MAX} multiline />
      {cancel.isError ? <Notice>{messMessage(cancel.error)}</Notice> : null}
      <Button label="Confirm cancellation" onPress={confirm} busy={cancel.isPending} />
      <Button label="Keep subscription" variant="secondary" onPress={() => setOpen(false)} disabled={cancel.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 14 },
  error: { color: colors.danger, fontSize: 13 },
  option: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg }
});
