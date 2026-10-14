// In-memory stand-in for the native keychain. Tests inspect `__store` to prove WHAT is (and is not) persisted.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
  getItemAsync: jest.fn(async (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null)),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
  __store: mockStore
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));

beforeEach(() => mockStore.clear());

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// expo-crypto's randomUUID() is backed by a NATIVE CSPRNG at runtime; under jest there is no native module, so Node's crypto stands in.
const mockNodeCrypto = require('crypto');
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => mockNodeCrypto.randomUUID()) }));
