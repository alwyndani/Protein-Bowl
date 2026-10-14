import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './components';

/** Only https:// image URLs are ever loaded (anything else, or a failed load, renders the neutral placeholder). No imagery is invented. */
export const isSafeImageUrl = (url: string | null | undefined): url is string => typeof url === 'string' && /^https:\/\/[^\s/]+/i.test(url.trim());

export function ProductImage({ uri, size = 72 }: { uri: string | null | undefined; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: 12 };
  if (!isSafeImageUrl(uri) || failed) {
    return (
      <View accessibilityLabel="No product image" style={[box, styles.placeholder]}>
        <Text style={styles.placeholderText}>PB</Text>
      </View>
    );
  }
  return <Image accessibilityIgnoresInvertColors source={{ uri: uri.trim() }} style={box} onError={() => setFailed(true)} />;
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.state}>
      <Text accessibilityRole="header" style={styles.stateTitle}>
        {title}
      </Text>
      {body ? <Text style={styles.stateBody}>{body}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={styles.state}>
      <Text style={[styles.stateTitle, { color: colors.danger }]}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Shown when a refetch failed but data from this session is still displayed (never persisted). */
export function StaleBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="May be out of date. Tap to refresh" onPress={onRetry} style={styles.stale}>
      <Text style={styles.staleText}>This may be out of date. Tap to refresh.</Text>
    </Pressable>
  );
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

export function Pill({ label, tone }: { label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? colors.accent : tone === 'warn' ? '#FBBF24' : tone === 'bad' ? colors.danger : colors.muted;
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function Stepper({ value, onMinus, onPlus, disabled, label }: { value: number; onMinus: () => void; onPlus: () => void; disabled?: boolean; label: string }) {
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={`${label} quantity ${value}`}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} accessibilityState={{ disabled: !!disabled || value <= 1 }} disabled={disabled || value <= 1} onPress={onMinus} style={[styles.stepBtn, (disabled || value <= 1) && { opacity: 0.4 }]}>
        <Text style={styles.stepText}>-</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPlus} style={[styles.stepBtn, disabled && { opacity: 0.4 }]}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: colors.muted, fontWeight: '700' },
  state: { padding: 24, alignItems: 'center', gap: 12 },
  stateTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  stateBody: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: colors.text, fontWeight: '600' },
  stale: { backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border, padding: 10 },
  staleText: { color: '#FBBF24', fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { color: colors.muted, fontSize: 15 },
  rowValue: { color: colors.text, fontSize: 15 },
  strong: { color: colors.text, fontWeight: '700', fontSize: 17 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.text, fontSize: 20 },
  stepValue: { color: colors.text, fontSize: 17, minWidth: 28, textAlign: 'center' }
});
