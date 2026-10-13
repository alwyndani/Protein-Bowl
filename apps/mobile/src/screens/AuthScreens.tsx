import React, { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { validateEmail, validateFullName, validateNewPassword, validateSignInPassword } from '../auth/validation';
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
      <View>
        <Button label="Create account" variant="secondary" onPress={() => navigation.navigate('Register')} disabled={busy} />
      </View>
    </Screen>
  );
}

export function RegisterScreen({ navigation }: RegisterProps) {
  const { manager } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string | null; email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    if (submitting.current) return;
    const next = { fullName: validateFullName(fullName), email: validateEmail(email), password: validateNewPassword(password) };
    setErrors(next);
    setFormError(null);
    if (next.fullName || next.email || next.password) return;
    submitting.current = true;
    setBusy(true);
    try {
      await manager.register({ fullName: fullName.trim(), email: email.trim(), password });
    } catch (e) {
      setFormError(messageForError(e, 'register'));
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
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!busy}
      />
      <Button label="Create account" onPress={submit} busy={busy} />
      <Button label="I already have an account" variant="secondary" onPress={() => navigation.navigate('SignIn')} disabled={busy} />
    </Screen>
  );
}
