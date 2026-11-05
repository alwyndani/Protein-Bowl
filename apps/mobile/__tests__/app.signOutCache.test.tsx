import { fireEvent, screen } from '@testing-library/react-native';
import { FakeWellnessBackend } from '../src/test/fakeWellnessBackend';
import { mountApp, seedDevice } from '../src/test/harness';

const press = async (name: string) => fireEvent.press(await screen.findByRole('button', { name }));

describe('app shell: bottom tabs and sign-out cache isolation', () => {
  it('shows exactly the five customer tabs with accessible labels', async () => {
    const backend = new FakeWellnessBackend();
    await seedDevice(backend, 'a@b.test');
    mountApp(backend);
    for (const label of ['Menu tab', 'Orders tab', 'Kerala Mess tab', 'Wellness tab', 'Account tab']) {
      expect(await screen.findByLabelText(label)).toBeTruthy();
    }
  });

  it('after sign-out and a different account signs in, no cached data of the first account is shown (the single QueryClient is cleared)', async () => {
    const backend = new FakeWellnessBackend();
    await seedDevice(backend, 'a@b.test');
    const a = backend.users.get('a@b.test')!;
    backend.addUser({ email: 'b@b.test', fullName: 'Bala Menon' });
    backend.seedProfile(a.id, { fullName: 'Asha Rao', heightCm: 165, weightKg: 62, goal: 'weight_loss', activityLevel: 'moderate' });

    mountApp(backend);

    fireEvent.press(await screen.findByLabelText('Wellness tab'));
    await press('Health profile');
    expect(await screen.findByLabelText('Height: 165 cm')).toBeTruthy();

    fireEvent.press(await screen.findByLabelText('Account tab'));
    await press('Sign out');
    expect(await screen.findByRole('button', { name: 'Create account' })).toBeTruthy();
    expect(screen.queryByLabelText('Wellness tab')).toBeNull();

    await press('Sign in');
    fireEvent.changeText(await screen.findByLabelText('Email'), 'b@b.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Password-123');
    await press('Sign in');
    fireEvent.press(await screen.findByLabelText('Wellness tab'));
    await press('Health profile');
    expect(await screen.findByLabelText('Height: Not provided')).toBeTruthy();
    expect(screen.queryByLabelText('Height: 165 cm')).toBeNull();
  });
});
