import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  Register: undefined;
  ForgotPassword: undefined;
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

/** Workout routes, mounted as extra screens of the Wellness stack (see MainTabs.tsx). */
export type WorkoutsStackParamList = {
  WorkoutPlans: undefined;
  WorkoutPlan: { planId: string };
};

export type MainTabParamList = {
  Menu: NavigatorScreenParams<MenuStackParamList> | undefined;
  OrdersTab: NavigatorScreenParams<OrdersStackParamList> | undefined;
  MessTab: undefined;
  WellnessTab: undefined;
  Account: undefined;
};
