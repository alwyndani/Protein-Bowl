import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  Register: undefined;
};

export type AddressMode = 'select' | 'manage';

export type MenuStackParamList = {
  Catalog: undefined;
  Product: { slug: string };
  Cart: undefined;
  Addresses: { mode: AddressMode };
  AddressForm: { addressId?: string; mode: AddressMode };
  Checkout: { addressId: string };
  OrderPlaced: { orderId: string };
};

export type OrdersStackParamList = {
  Orders: undefined;
  OrderDetail: { orderId: string };
};

export type MainTabParamList = {
  Menu: NavigatorScreenParams<MenuStackParamList> | undefined;
  OrdersTab: NavigatorScreenParams<OrdersStackParamList> | undefined;
  Account: undefined;
};
