import type { ExpoConfig, ConfigContext } from 'expo/config';

const DEFAULT_API_URL = 'http://localhost:3001/api';
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_STORE_ID = '00000000-0000-0000-0000-000000000101';
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getEnvValue = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = trimTrailingSlash(getEnvValue(process.env.EXPO_PUBLIC_API_URL) || DEFAULT_API_URL);
  const orgId = getEnvValue(process.env.EXPO_PUBLIC_ORG_ID) || DEFAULT_ORG_ID;
  const storeId = getEnvValue(process.env.EXPO_PUBLIC_STORE_ID) || DEFAULT_STORE_ID;

  return {
    ...config,
    name: 'Revendis',
    slug: 'revendis',
    version: '0.1.0',
    orientation: 'portrait',
    ios: { supportsTablet: true },
    assetBundlePatterns: ['**/*'],
    extra: {
      ...(config.extra ?? {}),
      apiUrl,
      orgId,
      storeId
    }
  };
};
