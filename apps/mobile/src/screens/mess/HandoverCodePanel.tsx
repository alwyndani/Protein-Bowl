import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatIstDateTime } from '../../commerce/dates';
import { useHandoverCode } from '../../mess/hooks';
import { messMessage } from '../../mess/messErrors';
import { Button, colors, Notice } from '../../ui/components';
import { messStyles } from './messShared';

/**
 * The service-point handover code for ONE meal that is out for service. The first resident of the service point to ask becomes the recipient
 * and reads the code to the delivery partner in person. The plaintext exists only in this panel's memory: it is not logged, not put in a URL
 * or navigation param, not stored on the device and not cached; it disappears when the panel closes. After that the resident can only
 * generate a new one (the server limits how many).
 */
export function HandoverCodePanel({ subscriptionId, mealId }: { subscriptionId: string; mealId: string }) {
  const h = useHandoverCode(subscriptionId, mealId);
  const [visible, setVisible] = useState(true);
  const [confirmNew, setConfirmNew] = useState(false);
  const s = h.state.data;

  const body = (() => {
    if (h.state.isPending) return <Text style={styles.text}>Loading handover code…</Text>;
    if (h.state.isError && !s) return <Notice>{messMessage(h.state.error)}</Notice>;
    if (!s) return null;
    // A code issued a moment ago is shown even if the state re-read has not landed yet.
    const state = h.code && (s.state === 'NOT_ISSUED' || s.state === 'CODE_EXPIRED' || s.state === 'CODE_BLOCKED') ? 'ISSUED_TO_YOU' : s.state;
    const left = h.code && state !== s.state ? h.code.regenerationsLeft : s.regenerationsLeft;
    switch (state) {
      case 'NOT_AVAILABLE':
        return <Text style={styles.text}>A handover code is not available for this meal right now.</Text>;
      case 'VERIFIED':
        return <Text style={styles.text}>Handover complete. No code is needed.</Text>;
      case 'ISSUED_TO_ANOTHER':
        return <Text style={styles.text}>A handover code was already issued to another resident of your service point.</Text>;
      case 'NOT_ISSUED':
        return (
          <>
            <Text style={styles.text}>The first resident to generate the code becomes the recipient. Read the code to the delivery partner in person.</Text>
            <Button label="Generate handover code" onPress={() => void h.issue()} busy={h.busy} />
          </>
        );
      case 'LOCKED':
        return <Text style={styles.text}>{`Too many incorrect attempts. Please try again after ${formatIstDateTime(s.lockedUntil)}.`}</Text>;
      default: {
        const canNew = left === undefined ? true : left > 0;
        const showingCode = state === 'ISSUED_TO_YOU' && h.code !== null;
        return (
          <>
            {state === 'CODE_BLOCKED' ? <Notice>This code was blocked after too many incorrect attempts.</Notice> : null}
            {state === 'CODE_EXPIRED' ? <Notice tone="info">This code has expired.</Notice> : null}
            {showingCode ? (
              <View accessibilityLiveRegion="polite">
                <Text accessibilityLabel={visible ? `Handover code ${h.code!.code.split('').join(' ')}` : 'Handover code hidden'} style={styles.code}>
                  {visible ? h.code!.code : '••••••'}
                </Text>
                <Text style={styles.text}>{`Valid until ${formatIstDateTime(h.code!.expiresAt)}`}</Text>
                <Button label={visible ? 'Hide code' : 'Show code'} variant="secondary" onPress={() => setVisible((v) => !v)} />
                <Button
                  label="Done"
                  variant="secondary"
                  onPress={() => {
                    h.hide();
                    setVisible(true);
                  }}
                />
              </View>
            ) : state === 'ISSUED_TO_YOU' ? (
              <Text style={styles.text}>You already generated this code. For your security it is shown only once. Generate a new code if you need it again.</Text>
            ) : null}
            {left !== undefined ? <Text style={messStyles.meta}>{`New codes left: ${left}`}</Text> : null}
            {canNew ? (
              confirmNew ? (
                <View style={{ gap: 8 }}>
                  <Text style={styles.text}>The previous code stops working as soon as a new one is generated.</Text>
                  <Button
                    label="Confirm new code"
                    onPress={() => {
                      setConfirmNew(false);
                      setVisible(true);
                      void h.regenerate();
                    }}
                    busy={h.busy}
                  />
                  <Button label="Keep current code" variant="secondary" onPress={() => setConfirmNew(false)} />
                </View>
              ) : (
                <Button label="Generate a new code" variant="secondary" onPress={() => setConfirmNew(true)} disabled={h.busy} />
              )
            ) : (
              <Text style={styles.text}>The maximum number of new codes has been reached.</Text>
            )}
          </>
        );
      }
    }
  })();

  return (
    <View style={messStyles.box} accessibilityLabel="Handover code">
      <Text accessibilityRole="header" style={messStyles.heading}>
        Handover code
      </Text>
      {body}
      {h.error ? <Notice>{messMessage(h.error)}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 14 },
  code: { color: colors.accent, fontSize: 34, fontWeight: '700', letterSpacing: 6, textAlign: 'center', paddingVertical: 8 }
});
