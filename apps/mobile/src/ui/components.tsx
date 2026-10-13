import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

export const colors = {
  bg: '#090D16',
  card: '#121A2A',
  border: '#27324A',
  text: '#F2F5FA',
  muted: '#9AA6BD',
  accent: '#34D399',
  accentText: '#04130C',
  danger: '#F87171'
};

/** Keyboard-aware, scrollable screen container (taps outside inputs keep working while the keyboard is open). */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }]}>{children}</Text>;
}

export function Notice({ children, tone = 'error' }: { children: React.ReactNode; tone?: 'error' | 'info' }) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.notice, tone === 'error' ? { borderColor: colors.danger } : { borderColor: colors.border }]}>
      <Text style={[styles.noticeText, tone === 'error' && { color: colors.danger }]}>{children}</Text>
    </View>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button({ label, onPress, disabled, busy, variant = 'primary' }: ButtonProps) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={[styles.button, variant === 'secondary' ? styles.buttonSecondary : styles.buttonPrimary, inactive && { opacity: 0.6 }]}
    >
      {busy ? <ActivityIndicator color={variant === 'primary' ? colors.accentText : colors.text} /> : <Text style={[styles.buttonText, variant === 'secondary' && { color: colors.text }]}>{label}</Text>}
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  error?: string | null;
}

export const TextField = React.forwardRef<TextInput, FieldProps>(function TextField({ label, error, ...rest }, ref) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? { borderColor: colors.danger } : null]}
        {...rest}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

export function CenteredStatus({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={styles.centered}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.body, { marginTop: 12, color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, gap: 14, flexGrow: 1, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  body: { color: colors.text, fontSize: 16, lineHeight: 22 },
  notice: { borderWidth: 1, borderRadius: 10, padding: 12, backgroundColor: colors.card },
  noticeText: { color: colors.text, fontSize: 14 },
  button: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '600' },
  field: { gap: 6 },
  label: { color: colors.muted, fontSize: 13 },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, fontSize: 16 },
  fieldError: { color: colors.danger, fontSize: 13 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg }
});
