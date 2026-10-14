import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AccountScreen } from '../screens/AccountScreen';
import { AddressFormScreen, AddressesScreen } from '../screens/commerce/AddressScreens';
import { CartScreen } from '../screens/commerce/CartScreen';
import { CatalogScreen, ProductScreen } from '../screens/commerce/CatalogScreens';
import { CheckoutScreen, OrderPlacedScreen } from '../screens/commerce/CheckoutScreens';
import { OrderDetailScreen, OrdersScreen } from '../screens/commerce/OrderScreens';
import { colors } from '../ui/components';
import type { MainTabParamList, MenuStackParamList, OrdersStackParamList } from './types';

const Tabs = createBottomTabNavigator<MainTabParamList>();
const MenuStack = createNativeStackNavigator<MenuStackParamList>();
const OrdersStack = createNativeStackNavigator<OrdersStackParamList>();

const stackOptions = { headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } };

function MenuNavigator() {
  return (
    <MenuStack.Navigator screenOptions={stackOptions} initialRouteName="Catalog">
      <MenuStack.Screen name="Catalog" component={CatalogScreen} options={{ title: 'Menu' }} />
      <MenuStack.Screen name="Product" component={ProductScreen} options={{ title: 'Item' }} />
      <MenuStack.Screen name="Cart" component={CartScreen} options={{ title: 'Cart' }} />
      <MenuStack.Screen name="Addresses" component={AddressesScreen} options={{ title: 'Delivery address' }} />
      <MenuStack.Screen name="AddressForm" component={AddressFormScreen} options={{ title: 'Address' }} />
      <MenuStack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Checkout' }} />
      <MenuStack.Screen name="OrderPlaced" component={OrderPlacedScreen} options={{ title: 'Order placed', headerBackVisible: false }} />
    </MenuStack.Navigator>
  );
}

function OrdersNavigator() {
  return (
    <OrdersStack.Navigator screenOptions={stackOptions} initialRouteName="Orders">
      <OrdersStack.Screen name="Orders" component={OrdersScreen} options={{ title: 'My orders' }} />
      <OrdersStack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Order' }} />
    </OrdersStack.Navigator>
  );
}

/**
 * The authenticated CUSTOMER shell (rendered only for a signed-in customer session): Menu, Orders, Account.
 * Kerala Mess is absent until its own subphase; there is no staff, KDS, wallet or payment route.
 */
export function MainTabs() {
  return (
    <Tabs.Navigator
      initialRouteName="Menu"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted
      }}
    >
      <Tabs.Screen name="Menu" component={MenuNavigator} options={{ tabBarAccessibilityLabel: 'Menu tab' }} />
      <Tabs.Screen name="OrdersTab" component={OrdersNavigator} options={{ title: 'Orders', tabBarAccessibilityLabel: 'Orders tab' }} />
      <Tabs.Screen name="Account" component={AccountScreen} options={{ headerShown: true, headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, tabBarAccessibilityLabel: 'Account tab' }} />
    </Tabs.Navigator>
  );
}
