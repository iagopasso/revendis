import type { ExpoConfig, ConfigContext } from 'expo/config';

const DEFAULT_API_URL = 'http://localhost:3001/api';
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_STORE_ID = '00000000-0000-0000-0000-000000000101';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: 'Revendis',
    slug: 'revendis',
    version: '0.1.0',
    orientation: 'portrait',
    ios: { supportsTablet: true },
    assetBundlePatterns: ['**/*'],
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL,
      orgId: process.env.EXPO_PUBLIC_ORG_ID ?? DEFAULT_ORG_ID,
      storeId: process.env.EXPO_PUBLIC_STORE_ID ?? DEFAULT_STORE_ID
    }
  };
};
