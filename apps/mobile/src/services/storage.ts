import * as SecureStore from 'expo-secure-store';

export class MobileStorage {
  private static memoryStore: Record<string, string> = {};

  /**
   * Securely store key-value pair using Expo SecureStore on iOS/Android native.
   * Falls back to localStorage / memory in non-native environments.
   */
  public static async setItem(key: string, value: string): Promise<void> {
    try {
      const isAvailable = await SecureStore.isAvailableAsync();
      if (isAvailable) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
    } catch (e) {
      // Fallback if native Keychain / Keystore is unavailable (e.g. Expo web)
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    } else {
      this.memoryStore[key] = value;
    }
  }

  /**
   * Securely retrieve key-value pair using Expo SecureStore on iOS/Android native.
   */
  public static async getItem(key: string): Promise<string | null> {
    try {
      const isAvailable = await SecureStore.isAvailableAsync();
      if (isAvailable) {
        return await SecureStore.getItemAsync(key);
      }
    } catch (e) {
      // Fallback if native Keychain / Keystore is unavailable
    }

    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return this.memoryStore[key] || null;
  }

  /**
   * Securely delete key-value pair from Expo SecureStore on iOS/Android native.
   */
  public static async removeItem(key: string): Promise<void> {
    try {
      const isAvailable = await SecureStore.isAvailableAsync();
      if (isAvailable) {
        await SecureStore.deleteItemAsync(key);
        return;
      }
    } catch (e) {
      // Fallback if native Keychain / Keystore is unavailable
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    delete this.memoryStore[key];
  }
}
