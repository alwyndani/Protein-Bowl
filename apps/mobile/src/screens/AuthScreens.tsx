import React, { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { validateEmail, validateFullName, validateNewPassword, validatePhone, validateSignInPassword } from '../auth/validation';
import { messageForError, messageForSignedOut } from '../copy/errorCopy';
import { Body, Button, Notice, Screen, TextField, Title } from '../ui/components';
import type { AuthStackParamList } from '../navigation/types';

type WelcomeProps = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;
type SignInProps = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;
type RegisterProps = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function WelcomeScreen({ navigation }: WelcomeProps) {
  const { state } = useAuth();
  const notice = state.status === 'signedOut' ? messageForSignedOut(state.reason) : null;
  return (
    <Screen>
      <Title>Protein Bowl</Title>
      <Body muted>Sign in or create a customer account to continue.</Body>
      {notice ? <Notice tone="info">{notice}</Notice> : null}
      <Button label="Sign in" onPress={() => navigation.navigate('SignIn')} />
      <Button label="Create account" variant="secondary" onPress={() => navigation.navigate('Register')} />
    </Screen>
  );
}

export function SignInScreen({ navigation }: SignInProps) {
  const { manager } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false); // duplicate-submit lock (state alone is async)
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    if (submitting.current) return;
    const next = { email: validateEmail(email), password: validateSignInPassword(password) };
    setErrors(next);
    setFormError(null);
    if (next.email || next.password) return;
    submitting.current = true;
    setBusy(true);
    try {
      await manager.signIn(email.trim(), password);
      // success: the navigator switches to the customer shell; nothing else to do here.
    } catch (e) {
      setFormError(messageForError(e, 'signIn'));
      setBusy(false);
      submitting.current = false;
    }
  }

  return (
    <Screen>
      <Title>Sign in</Title>
      {formError ? <Notice>{formError}</Notice> : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!busy}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!busy}
      />
      <Button label="Sign in" onPress={submit} busy={busy} />
      <View style={{ gap: 12 }}>
        <Button label="Forgot password?" variant="secondary" onPress={() => navigation.navigate('ForgotPassword')} disabled={busy} />
        <Button label="Create account" variant="secondary" onPress={() => navigation.navigate('Register')} disabled={busy} />
      </View>
    </Screen>
  );
}

/** Fixed copy only: server text is never shown. The success message is the same whether or not the account exists. */
export function passwordResetMessage(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  if (status === 503) return 'Password reset by email is not available right now. Please contact Protein Bowl support.';
  if (status === 429) return 'Too many requests. Please wait a little and try again.';
  if (status === 422) return 'Enter a valid email address.';
  return 'We could not send the reset email. Please check your connection and try again.';
}

export function ForgotPasswordScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>) {
  const { manager } = useAuth();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  async function submit() {
    if (submitting.current) return;
    const err = validateEmail(email);
    setEmailError(err);
    setFormError(null);
    if (err) return;
    submitting.current = true;
    setBusy(true);
    try {
      await manager.requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setFormError(passwordResetMessage(e));
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }

  if (sent) {
    return (
      <Screen>
        <Title>Check your email</Title>
        <Notice tone="info">{`If an account exists for ${email.trim()}, we have sent a password reset link. Open it in your phone's browser to choose a new password. The link expires soon and works once.`}</Notice>
        <Button label="Back to sign in" onPress={() => navigation.navigate('SignIn')} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Title>Reset your password</Title>
      <Body muted>Enter the email address of your account. We will email you a link to choose a new password.</Body>
      {formError ? <Notice>{formError}</Notice> : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!busy}
      />
      <Button label="Send reset link" onPress={submit} busy={busy} />
    </Screen>
  );
}

export function RegisterScreen({ navigation }: RegisterProps) {
  const { manager } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string | null; email?: string | null; password?: string | null; phone?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  async function submit() {
    if (submitting.current) return;
    const next = { fullName: validateFullName(fullName), email: validateEmail(email), password: validateNewPassword(password), phone: validatePhone(phone) };
    setErrors(next);
    setFormError(null);
    if (next.fullName || next.email || next.password || next.phone) return;
    submitting.current = true;
    setBusy(true);
    try {
      const trimmedPhone = phone.trim();
      await manager.register({ fullName: fullName.trim(), email: email.trim(), password, ...(trimmedPhone ? { phone: trimmedPhone } : {}) });
    } catch (e) {
      setFormError(messageForError(e, 'register', { phoneProvided: phone.trim().length > 0 }));
      setBusy(false);
      submitting.current = false;
    }
  }

  return (
    <Screen>
      <Title>Create account</Title>
      {formError ? <Notice>{formError}</Notice> : null}
      <TextField
        label="Full name"
        value={fullName}
        onChangeText={setFullName}
        error={errors.fullName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
        editable={!busy}
      />
      <TextField
        ref={emailRef}
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!busy}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => phoneRef.current?.focus()}
        editable={!busy}
      />
      <TextField
        ref={phoneRef}
        label="Phone number (optional)"
        value={phone}
        onChangeText={setPhone}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={20}
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!busy}
      />
      <Button label="Create account" onPress={submit} busy={busy} />
      <Button label="I already have an account" variant="secondary" onPress={() => navigation.navigate('SignIn')} disabled={busy} />
    </Screen>
  );
}
