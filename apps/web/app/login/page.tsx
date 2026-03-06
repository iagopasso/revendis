import { redirect } from 'next/navigation';
import type { CSSProperties } from 'react';
import { auth } from '../../auth';
import LoginPanel from './login-panel';

type LoginBranding = {
  color: string;
};

const DEFAULT_LOGIN_BRANDING: LoginBranding = {
  color: '#8860DB'
};

const withNoTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const sanitizeEnvUrl = (value: string) =>
  withNoTrailingSlash((value || '').trim().replace(/^['"]|['"]$/g, ''));

const resolveBackendBase = () => {
  const explicitTarget = sanitizeEnvUrl(process.env.API_PROXY_TARGET || process.env.AUTH_API_BASE || '');
  if (explicitTarget) return explicitTarget;

  const publicApiBase = sanitizeEnvUrl(process.env.NEXT_PUBLIC_API_URL || '');
  if (/^https?:\/\//i.test(publicApiBase)) return publicApiBase;

  return 'http://127.0.0.1:3001/api';
};

const LOGIN_BRAND_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const normalizeBrandColor = (value?: string | null) => {
  const trimmed = (value || '').trim();
  return LOGIN_BRAND_COLOR_REGEX.test(trimmed) ? trimmed : DEFAULT_LOGIN_BRANDING.color;
};

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const darkenHex = (hex: string, amount: number) => {
  const normalized = hex.trim().replace('#', '');
  const full = normalized.length === 3 ? normalized.split('').map((part) => part + part).join('') : normalized;
  if (full.length !== 6) return hex;
  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) return hex;
  const factor = Math.max(0, Math.min(1, 1 - amount));
  const nextRed = clampChannel(red * factor);
  const nextGreen = clampChannel(green * factor);
  const nextBlue = clampChannel(blue * factor);
  return `#${nextRed.toString(16).padStart(2, '0')}${nextGreen
    .toString(16)
    .padStart(2, '0')}${nextBlue.toString(16).padStart(2, '0')}`;
};

const loadLoginBranding = async (): Promise<LoginBranding> => {
  const backendBase = resolveBackendBase();

  try {
    const response = await fetch(`${backendBase}/settings/storefront`, {
      method: 'GET',
      cache: 'no-store'
    });

    if (!response.ok) return DEFAULT_LOGIN_BRANDING;

    const payload = (await response.json().catch(() => null)) as {
      data?: { shopName?: string; logoUrl?: string; shopColor?: string };
    } | null;
    const data = payload?.data;

    return {
      color: normalizeBrandColor(data?.shopColor)
    };
  } catch {
    return DEFAULT_LOGIN_BRANDING;
  }
};

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect('/dashboard');
  }

  const branding = await loadLoginBranding();
  const accent = branding.color;
  const accentStrong = darkenHex(accent, 0.22);

  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const appleEnabled = Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET);

  return (
    <main
      className="auth-page"
      style={
        {
          ['--auth-accent' as string]: accent,
          ['--auth-accent-strong' as string]: accentStrong
        } as CSSProperties
      }
    >
      <LoginPanel googleEnabled={googleEnabled} appleEnabled={appleEnabled} />
    </main>
  );
}
