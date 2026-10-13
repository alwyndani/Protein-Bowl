import * as SecureStore from 'expo-secure-store';

/**
 * The ONLY persisted credential: the mobile refresh token (+ its expiry), in Expo SecureStore (iOS Keychain / Android Keystore-backed).
 * There is NO fallback of any kind: no AsyncStorage, localStorage, file, SQLite or in-memory substitute for this long-lived secret.
 * If secure storage is unavailable the app cannot keep a session (SecureStorageError) - it never degrades to something weaker.
 *
 * Never persisted: access token, password, user profile, roles, handover codes, payment evidence.
 *
 * keychainAccessible WHEN_UNLOCKED_THIS_DEVICE_ONLY applies on iOS (item readable only while unlocked, never migrated to another
 * device or included in backups). On Android, expo-secure-store has no equivalent option: values are encrypted with a Keystore key
 * and stay on the device.
 */
export const SESSION_KEY = 'pb.session.v1';

export interface StoredSession {
  refreshToken: string;
  /** ISO timestamp from the server (refreshTokenExpiresAt). */
  expiresAt: string;
}

export class SecureStorageError extends Error {
  constructor() {
    super('SECURE_STORAGE_UNAVAILABLE');
    this.name = 'SecureStorageError';
  }
}

export interface SessionStorage {
  read(): Promise<StoredSession | null>;
  write(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const secureSessionStorage: SessionStorage = {
  async read() {
    let raw: string | null;
    try {
      raw = await SecureStore.getItemAsync(SESSION_KEY, OPTIONS);
    } catch {
      throw new SecureStorageError();
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredSession>;
      if (typeof parsed.refreshToken === 'string' && parsed.refreshToken && typeof parsed.expiresAt === 'string') {
        return { refreshToken: parsed.refreshToken, expiresAt: parsed.expiresAt };
      }
    } catch {
      /* fall through: unreadable content is treated as no session */
    }
    await this.clear().catch(() => undefined);
    return null;
  },

  async write(session) {
    try {
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ refreshToken: session.refreshToken, expiresAt: session.expiresAt }), OPTIONS);
    } catch {
      throw new SecureStorageError();
    }
  },

  async clear() {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY, OPTIONS);
    } catch {
      throw new SecureStorageError();
    }
  }
};
