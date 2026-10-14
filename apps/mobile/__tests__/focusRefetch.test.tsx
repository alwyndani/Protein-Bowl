import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useRefetchOnFocus } from '../src/commerce/hooks';

/**
 * Deterministic regression for useRefetchOnFocus (a P11B hook; it never existed in P11A). Contract:
 *  - the FIRST focus (mount) does not refetch (the query already fetches on mount);
 *  - each later focus event refetches exactly ONCE;
 *  - re-renders (even with a brand-new `refetch` function every render) never refetch;
 *  - the call always uses the LATEST callback (no stale closure);
 *  - after unmount nothing is called.
 */
type Params = { A: undefined; B: undefined };
const Stack = createNativeStackNavigator<Params>();

function harness(refetch: jest.Mock, useHook: (fn: () => unknown) => void) {
  function A({ navigation }: { navigation: { navigate: (n: 'B') => void } }) {
    const [n, setN] = useState(0);
    useHook(() => refetch(n)); // a NEW function identity on every render, closing over `n`
    return (
      <>
        <Text>{`render ${n}`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="rerender" onPress={() => setN((v) => v + 1)} />
        <Pressable accessibilityRole="button" accessibilityLabel="go" onPress={() => navigation.navigate('B')} />
      </>
    );
  }
  function B({ navigation }: { navigation: { goBack: () => void } }) {
    return <Pressable accessibilityRole="button" accessibilityLabel="back" onPress={() => navigation.goBack()} />;
  }
  return render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="A" component={A as never} />
        <Stack.Screen name="B" component={B as never} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const btn = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

describe('P11B useRefetchOnFocus', () => {
  it('does not refetch on mount, refetches exactly once per later focus, never on re-render, and uses the latest closure', async () => {
    const refetch = jest.fn();
    harness(refetch, useRefetchOnFocus);
    await screen.findByText('render 0');
    expect(refetch).toHaveBeenCalledTimes(0); // mount focus

    btn('rerender');
    btn('rerender');
    btn('rerender');
    await screen.findByText('render 3');
    expect(refetch).toHaveBeenCalledTimes(0); // re-renders with a new function identity every time: no refetch, no loop

    btn('go');
    await screen.findByLabelText('back');
    expect(refetch).toHaveBeenCalledTimes(0); // blur is not a focus
    btn('back');
    await screen.findByText('render 3');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenLastCalledWith(3); // the LATEST state, not the mount-time closure

    btn('rerender');
    await screen.findByText('render 4');
    expect(refetch).toHaveBeenCalledTimes(1);

    btn('go');
    await screen.findByLabelText('back');
    btn('back');
    await screen.findByText('render 4');
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(refetch).toHaveBeenLastCalledWith(4);
  });

  it('unmount: nothing is called afterwards', async () => {
    const refetch = jest.fn();
    const view = harness(refetch, useRefetchOnFocus);
    await screen.findByText('render 0');
    btn('go');
    await screen.findByLabelText('back');
    view.unmount();
    expect(refetch).toHaveBeenCalledTimes(0);
  });

  it('CONTRAST (why the hook keeps the callback in a ref): the naive shape refetches on every re-render when the callback identity changes', async () => {
    const refetch = jest.fn();
    const naive = (fn: () => unknown) => {
      const first = useMemo(() => ({ done: false }), []);
      useFocusEffect(
        useCallback(() => {
          if (first.done) void fn();
          first.done = true;
        }, [fn, first])
      );
    };
    harness(refetch, naive);
    await screen.findByText('render 0');
    btn('rerender');
    btn('rerender');
    await screen.findByText('render 2');
    expect(refetch.mock.calls.length).toBeGreaterThan(0); // the naive shape over-fires with NO focus change
  });
});
