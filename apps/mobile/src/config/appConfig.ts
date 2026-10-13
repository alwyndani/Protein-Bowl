import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface AppConfig {
  /** API base URL including the /api/v1 prefix, no trailing slash. */
  apiBaseUrl: string;
  environment: 'development' | 'production';
  appVersion: string;
  platform: 'android' | 'ios';
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface RawEnv {
  apiUrl?: string;
  appEnv?: string;
}

/** Metro only inlines STATIC `process.env.EXPO_PUBLIC_X` reads, so they are listed literally here. Public values only - never a secret. */
export function readRawEnv(): RawEnv {
  return { apiUrl: process.env.EXPO_PUBLIC_API_URL, appEnv: process.env.EXPO_PUBLIC_APP_ENV };
}

const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/**
 * Pure and testable. There is NO hard-coded API URL and NO production localhost fallback: the URL must be provided explicitly.
 * Production (explicit, or any non-__DEV__ build) additionally requires HTTPS.
 */
export function resolveConfig(raw: RawEnv, opts: { isDev: boolean; platform: string; appVersion?: string | null }): AppConfig {
  const environment: AppConfig['environment'] = raw.appEnv === 'production' || (!opts.isDev && raw.appEnv !== 'development') ? 'production' : 'development';
  const url = (raw.apiUrl ?? '').trim();
  if (!url) throw new ConfigError('EXPO_PUBLIC_API_URL is not set.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConfigError('EXPO_PUBLIC_API_URL is not a valid URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new ConfigError('EXPO_PUBLIC_API_URL must be an http(s) URL.');
  if (parsed.username || parsed.password) throw new ConfigError('EXPO_PUBLIC_API_URL must not contain credentials.');
  if (environment === 'production' && parsed.protocol !== 'https:') throw new ConfigError('Production requires an https:// API URL.');
  if (opts.platform !== 'android' && opts.platform !== 'ios') throw new ConfigError('Unsupported platform.');
  const appVersion = opts.appVersion && SEMVER.test(opts.appVersion) ? opts.appVersion : null;
  if (!appVersion) throw new ConfigError('The app version is missing or not MAJOR.MINOR.PATCH.');
  return {
    apiBaseUrl: url.replace(/\/+$/, ''),
    environment,
    appVersion,
    platform: opts.platform
  };
}

let cached: AppConfig | null = null;

export function getAppConfig(): AppConfig {
  if (!cached) {
    cached = resolveConfig(readRawEnv(), { isDev: __DEV__, platform: Platform.OS, appVersion: Constants.expoConfig?.version });
  }
  return cached;
}

/** The explicit client contract the backend's /auth/mobile/* routes require. Identification and version gating only - NOT a security boundary. */
export function clientHeader(config: Pick<AppConfig, 'appVersion' | 'platform'>): string {
  return `protein-bowl-mobile/${config.appVersion} (${config.platform})`;
}
