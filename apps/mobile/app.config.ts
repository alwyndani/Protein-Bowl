import type { ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config (P11A). Validates the build environment so a production build can never be produced against a missing or
 * non-HTTPS API URL. Only PUBLIC values live in EXPO_PUBLIC_* variables - never a secret. The minimum supported app version is
 * BACKEND configuration (MOBILE_MIN_APP_VERSION), not an app setting.
 *
 * No icon / splash / adaptive-icon is referenced on purpose: no production artwork exists yet and none is invented.
 *
 * Native modules (P11C-1): `react-native-razorpay` and `expo-dev-client` need a DEVELOPMENT BUILD (EAS or local); Expo Go cannot load the Razorpay
 * module (the app still runs there and reports payment as unavailable). The native projects are generated (Continuous Native Generation):
 * no android/ or ios/ directory is committed. New Architecture is NOT set: Expo SDK 52 generates `newArchEnabled=false` when unset.
 * Android needs no app-level manifest/ProGuard change (the Razorpay SDK's AAR manifest declares CheckoutActivity and the UPI <queries>, and
 * bundles its own consumer ProGuard rules).
 */
const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (appEnv === 'production') {
  if (!apiUrl || !/^https:\/\/[^\s/]+/i.test(apiUrl)) {
    throw new Error('Production builds require EXPO_PUBLIC_API_URL to be an https:// URL.');
  }
}

const config: ExpoConfig = {
  name: 'Protein Bowl',
  slug: 'protein-bowl-mobile',
  owner: 'protein-bowl',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  platforms: ['ios', 'android'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.proteinbowl.app',
    infoPlist: {
      // Razorpay UPI intent on iOS (documented list; the SDK supports exactly these schemes).
      LSApplicationQueriesSchemes: ['tez', 'phonepe', 'paytmmp']
    }
  },
  android: {
    package: 'com.proteinbowl.app'
  },
  extra: {
    eas: {
      // EAS project linkage (public identifier, not a secret): @protein-bowl/protein-bowl-mobile
      projectId: '4ee27846-4698-4894-8f71-2d8f7be6c4bf'
    }
  }
};

export default config;
