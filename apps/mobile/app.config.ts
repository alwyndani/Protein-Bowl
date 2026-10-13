import type { ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config (P11A). Validates the build environment so a production build can never be produced against a missing or
 * non-HTTPS API URL. Only PUBLIC values live in EXPO_PUBLIC_* variables - never a secret. The minimum supported app version is
 * BACKEND configuration (MOBILE_MIN_APP_VERSION), not an app setting.
 *
 * No icon / splash / adaptive-icon is referenced on purpose: no production artwork exists yet and none is invented. Expo Go compatible:
 * no native module beyond Expo SDK modules, no prebuild, no android/ or ios/ directory.
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
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  platforms: ['ios', 'android'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.proteinbowl.app'
  },
  android: {
    package: 'com.proteinbowl.app'
  }
};

export default config;
