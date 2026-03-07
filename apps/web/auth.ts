import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Apple from 'next-auth/providers/apple';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';

type AuthUserPayload = {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationId?: string;
  storeId?: string | null;
};

const providers: NonNullable<NextAuthConfig['providers']> = [];
const defaultAuthUserName =
  (process.env.AUTH_DEFAULT_USER_NAME || process.env.AUTH_RESELLER_NAME || 'Revendedora').trim() || 'Revendedora';
const defaultOrgId = process.env.NEXT_PUBLIC_ORG_ID || '00000000-0000-0000-0000-000000000001';
const mutationAuthToken =
  process.env.MUTATION_AUTH_TOKEN || process.env.NEXT_PUBLIC_MUTATION_AUTH_TOKEN || '';
const googleClientId = `${process.env.AUTH_GOOGLE_ID || ''}`.trim();
const googleClientSecret = `${process.env.AUTH_GOOGLE_SECRET || ''}`.trim();
const appleClientId = `${process.env.AUTH_APPLE_ID || ''}`.trim();
const appleClientSecret = `${process.env.AUTH_APPLE_SECRET || ''}`.trim();

const withNoTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const sanitizeEnvUrl = (value: string) =>
  withNoTrailingSlash((value || '').trim().replace(/^['"]|['"]$/g, ''));
const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

const normalizeOrigin = (value: string) => {
  const normalized = sanitizeEnvUrl(value);
  if (!normalized) return '';
  if (isAbsoluteUrl(normalized)) return normalized;
  if (/^[a-z0-9.-]+(?::\d+)?$/i.test(normalized)) {
    return `https://${normalized}`;
  }
  return '';
};

const resolveAppOrigin = () => {
  const explicitOrigin = normalizeOrigin(
    process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_URL ||
      ''
  );
  if (explicitOrigin) return explicitOrigin;
  return normalizeOrigin(process.env.VERCEL_URL || '');
};

const toAbsoluteUrl = (origin: string, value: string) => {
  try {
    return withNoTrailingSlash(new URL(value, `${origin}/`).toString());
  } catch {
    return '';
  }
};

const pushApiBaseCandidate = (candidates: string[], value: string) => {
  const normalized = sanitizeEnvUrl(value);
  if (!normalized || candidates.includes(normalized)) return;
  candidates.push(normalized);
};

const resolveApiBases = () => {
  const candidates: string[] = [];
  const appOrigin = resolveAppOrigin();
  const explicitTarget = sanitizeEnvUrl(process.env.API_PROXY_TARGET || process.env.AUTH_API_BASE || '');
  const publicApiBase = sanitizeEnvUrl(process.env.NEXT_PUBLIC_API_URL || '');

  if (explicitTarget) {
    if (isAbsoluteUrl(explicitTarget)) {
      pushApiBaseCandidate(candidates, explicitTarget);
    } else if (appOrigin && explicitTarget.startsWith('/')) {
      pushApiBaseCandidate(candidates, toAbsoluteUrl(appOrigin, explicitTarget));
    }
  }

  if (publicApiBase) {
    if (isAbsoluteUrl(publicApiBase)) {
      pushApiBaseCandidate(candidates, publicApiBase);
    } else if (appOrigin && publicApiBase.startsWith('/')) {
      pushApiBaseCandidate(candidates, toAbsoluteUrl(appOrigin, publicApiBase));
    }
  }

  if (appOrigin) {
    pushApiBaseCandidate(candidates, `${appOrigin}/api/backend`);
  }

  pushApiBaseCandidate(candidates, 'http://127.0.0.1:3001/api');
  return candidates;
};

const AUTH_API_BASES = resolveApiBases();

const fetchAuthApi = async (path: string, init: RequestInit) => {
  let lastError: unknown = null;

  for (const [index, base] of AUTH_API_BASES.entries()) {
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        cache: 'no-store'
      });
      const hasNextCandidate = index < AUTH_API_BASES.length - 1;
      if (!response.ok && hasNextCandidate && [404, 502, 503].includes(response.status)) {
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to reach auth API for ${path}.`);
};

const normalizeSessionRole = (value: unknown): 'owner' | 'seller' => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'owner' || normalized === 'admin') return 'owner';
  return 'seller';
};

const authenticateWithBackendCredentials = async (
  email: string,
  password: string
): Promise<AuthUserPayload | null> => {
  try {
    const response = await fetchAuthApi('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-org-id': defaultOrgId
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as { data?: AuthUserPayload } | null;
    if (!payload?.data?.id || !payload.data.email) return null;
    return payload.data;
  } catch (error) {
    console.error('[auth] credentials login request failed', {
      bases: AUTH_API_BASES,
      error: error instanceof Error ? error.message : 'unknown_error'
    });
    return null;
  }
};

const syncSocialUser = async (email: string, name: string): Promise<AuthUserPayload | null> => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-org-id': defaultOrgId
  };
  if (mutationAuthToken) {
    headers['x-mutation-token'] = mutationAuthToken;
  }

  try {
    const syncResponse = await fetchAuthApi('/auth/social-sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: name.trim() || 'Revendedor(a)',
        email: normalizedEmail
      })
    });

    if (!syncResponse.ok) return null;
    const payload = (await syncResponse.json().catch(() => null)) as { data?: AuthUserPayload } | null;
    if (!payload?.data?.id || !payload.data.email) return null;
    return payload.data;
  } catch (error) {
    console.error('[auth] social sync request failed', {
      bases: AUTH_API_BASES,
      error: error instanceof Error ? error.message : 'unknown_error'
    });
    return null;
  }
};

providers.push(
  Credentials({
    id: 'credentials',
    name: 'Email e senha',
    credentials: {
      email: { label: 'E-mail', type: 'text' },
      password: { label: 'Senha', type: 'password' }
    },
    authorize: async (credentials) => {
      const email = `${credentials?.email || ''}`.trim().toLowerCase();
      const password = `${credentials?.password || ''}`;
      if (!email || !password) return null;

      const backendUser = await authenticateWithBackendCredentials(email, password);
      if (!backendUser) return null;

      const organizationId = `${backendUser.organizationId || ''}`.trim();
      const storeId = `${backendUser.storeId || ''}`.trim();
      if (!organizationId || !storeId) return null;

      return {
        id: backendUser.id,
        name: backendUser.name,
        email: backendUser.email,
        role: normalizeSessionRole(backendUser.role),
        organizationId,
        storeId
      };
    }
  })
);

if (googleClientId && googleClientSecret) {
  providers.push(
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      authorization: {
        params: {
          prompt: 'select_account'
        }
      }
    })
  );
}

if (appleClientId && appleClientSecret) {
  providers.push(
    Apple({
      clientId: appleClientId,
      clientSecret: appleClientSecret
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: {
    strategy: 'jwt'
  },
  pages: {
    signIn: '/login'
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'credentials') return true;
      const email = (user.email || '').trim().toLowerCase();
      if (!email) return false;

      const syncedUser = await syncSocialUser(email, (user.name || defaultAuthUserName).trim());
      const syncedOrgId = `${syncedUser?.organizationId || ''}`.trim();
      const syncedStoreId = `${syncedUser?.storeId || ''}`.trim();
      if (!syncedUser?.id || !syncedOrgId || !syncedStoreId) return false;

      const mutableUser = user as typeof user & {
        id?: string;
        role?: string;
        organizationId?: string;
        storeId?: string;
      };
      mutableUser.id = syncedUser.id;
      mutableUser.name = syncedUser.name || user.name || defaultAuthUserName;
      mutableUser.email = syncedUser.email || email;
      mutableUser.role = normalizeSessionRole(syncedUser.role);
      mutableUser.organizationId = syncedOrgId;
      mutableUser.storeId = syncedStoreId;
      return true;
    },
    async jwt({ token, user, account }) {
      const userIdFromUser =
        user && 'id' in user ? `${(user as { id?: unknown }).id || ''}`.trim() : '';
      const roleFromUser =
        user && 'role' in user ? normalizeSessionRole((user as { role?: unknown }).role) : null;
      const imageFromUser =
        user && 'image' in user ? `${(user as { image?: unknown }).image || ''}`.trim() : '';
      const orgIdFromUser =
        user && 'organizationId' in user
          ? `${(user as { organizationId?: unknown }).organizationId || ''}`.trim()
          : '';
      const storeIdFromUser =
        user && 'storeId' in user ? `${(user as { storeId?: unknown }).storeId || ''}`.trim() : '';

      if (account?.provider === 'credentials') {
        token.role = roleFromUser || 'seller';
      } else if (account) {
        token.role = roleFromUser || 'seller';
      } else if (typeof token.role !== 'string') {
        token.role = 'seller';
      }

      if (userIdFromUser) {
        token.sub = userIdFromUser;
      }

      if (imageFromUser) {
        token.picture = imageFromUser;
      }

      if (orgIdFromUser) {
        token.orgId = orgIdFromUser;
      }

      if (storeIdFromUser) {
        token.storeId = storeIdFromUser;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const sessionUser = session.user as typeof session.user & {
          id?: string;
          image?: string | null;
          role?: string;
          organizationId?: string;
          storeId?: string;
        };
        sessionUser.id =
          typeof token.sub === 'string' ? token.sub : '';
        sessionUser.role =
          typeof token.role === 'string' ? token.role : 'seller';
        if (typeof token.picture === 'string' && token.picture.trim()) {
          sessionUser.image = token.picture.trim();
        }

        const orgId = typeof token.orgId === 'string' ? token.orgId.trim() : '';
        const storeId = typeof token.storeId === 'string' ? token.storeId.trim() : '';
        if (orgId) {
          sessionUser.organizationId = orgId;
        } else {
          delete sessionUser.organizationId;
        }
        if (storeId) {
          sessionUser.storeId = storeId;
        } else {
          delete sessionUser.storeId;
        }
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return url;

      try {
        const target = new URL(url);
        const currentBase = new URL(baseUrl);

        if (target.origin === currentBase.origin || target.hostname === 'localhost' || target.hostname === '127.0.0.1') {
          return `${target.pathname}${target.search}${target.hash}`;
        }
      } catch {
        // keep default fallback below
      }

      return url;
    }
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-only-secret-change-me'
});
