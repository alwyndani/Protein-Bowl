import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../../ui/components';
import { ErrorState } from '../../ui/commerceUi';
import { isAuthFailure, messMessage } from '../../mess/messErrors';

/** Centered loading indicator with an accessible label (same look as the commerce screens). */
export function LoadingView({ label }: { label: string }) {
  return (
    <View accessibilityLabel={label} style={styles.center}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

/** A full-screen failure. A 401 / 403 offers no retry (retrying cannot help); anything else may be retried by hand. */
export function FailureView({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return <ErrorState message={messMessage(error)} onRetry={isAuthFailure(error) ? undefined : onRetry} />;
}

export const messStyles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  box: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 6 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '700' },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }
});
