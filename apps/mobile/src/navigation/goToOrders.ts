/** Navigate from inside the Menu stack to the Orders tab (optionally straight to one order). Typed loosely on purpose: parent tab navigator. */
type TabNavigator = { navigate: (name: string, params?: object) => void };

export function goToOrders(navigation: { getParent: () => unknown }, orderId?: string) {
  const parent = navigation.getParent() as TabNavigator | undefined;
  if (!parent) return;
  if (orderId) parent.navigate('OrdersTab', { screen: 'OrderDetail', params: { orderId } });
  else parent.navigate('OrdersTab', { screen: 'Orders' });
}
