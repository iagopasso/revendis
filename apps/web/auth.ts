import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Facebook from 'next-auth/providers/facebook';
import Google from 'next-auth/providers/google';

type CredentialUser = {
  id: string;
  email: string;
  password: string;
  name: string;
  role: 'owner' | 'seller';
};

const providers: NonNullable<NextAuthConfig['providers']> = [];
const adminEmail = (process.env.AUTH_ADMIN_EMAIL || 'admin@revendis.local').trim().toLowerCase();
const adminPassword = process.env.AUTH_ADMIN_PASSWORD || 'Admin@123456';
const adminName = (process.env.AUTH_ADMIN_NAME || 'Administrador').trim() || 'Administrador';
const resellerEmail = (process.env.AUTH_RESELLER_EMAIL || 'revenda@revendis.local').trim().toLowerCase();
const resellerPassword = process.env.AUTH_RESELLER_PASSWORD || 'Revenda@123456';
const resellerName = (process.env.AUTH_RESELLER_NAME || 'Revenda').trim() || 'Revenda';
const defaultOrgId = process.env.NEXT_PUBLIC_ORG_ID || '00000000-0000-0000-0000-000000000001';
const mutationAuthToken =
  process.env.MUTATION_AUTH_TOKEN || process.env.NEXT_PUBLIC_MUTATION_AUTH_TOKEN || '';

const credentialUsers: CredentialUser[] = [];
const pushCredentialUser = (user: CredentialUser) => {
  if (!user.email || !user.password) return;
  if (credentialUsers.some((entry) => entry.email === user.email)) return;
  credentialUsers.push(user);
};

pushCredentialUser({
  id: 'local-admin',
  email: adminEmail,
  password: adminPassword,
  name: adminName,
  role: 'owner'
});
pushCredentialUser({
  id: 'local-reseller',
  email: resellerEmail,
  password: resellerPassword,
  name: resellerName,
  role: 'seller'
});

const credentialUsersByEmail = new Map(credentialUsers.map((user) => [user.email, user]));

const withNoTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const resolveApiBase = () => {
  const envBase = withNoTrailingSlash(process.env.AUTH_API_BASE || process.env.NEXT_PUBLIC_API_URL || '');
  if (envBase) return envBase;
  return 'http://localhost:3001/api';
};

const AUTH_API_BASE = resolveApiBase();

const syncSocialUserAsReseller = async (email: string, name: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-org-id': defaultOrgId
  };
  if (mutationAuthToken) {
    headers['x-mutation-token'] = mutationAuthToken;
  }

  try {
    const createResponse = await fetch(`${AUTH_API_BASE}/settings/access`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: name.trim() || 'Revendedor(a)',
        email: normalizedEmail,
        role: 'seller',
        active: true
      }),
      cache: 'no-store'
    });

    if (createResponse.ok) return;
    if (createResponse.status !== 409) return;

    const listResponse = await fetch(`${AUTH_API_BASE}/settings/access`, {
      method: 'GET',
      headers: {
        'x-org-id': defaultOrgId
      },
      cache: 'no-store'
    });

    if (!listResponse.ok) return;
    const listPayload = (await listResponse.json().catch(() => null)) as
      | { data?: Array<{ id: string; email: string }> }
      | null;
    const member = listPayload?.data?.find(
      (item) => item.email?.trim().toLowerCase() === normalizedEmail
    );
    if (!member?.id) return;

    await fetch(`${AUTH_API_BASE}/settings/access/${member.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        name: name.trim() || 'Revendedor(a)',
        role: 'seller',
        active: true
      }),
      cache: 'no-store'
    });
  } catch {
    // Do not block sign-in when backend sync is unavailable.
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
      const user = credentialUsersByEmail.get(email);
      if (!user || user.password !== password) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      };
    }
  })
);

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET
    })
  );
}

if (process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET) {
  providers.push(
    Facebook({
      clientId: process.env.AUTH_FACEBOOK_ID,
      clientSecret: process.env.AUTH_FACEBOOK_SECRET
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
      await syncSocialUserAsReseller(email, (user.name || resellerName).trim());
      return true;
    },
    async jwt({ token, user, account }) {
      const tokenEmail = `${user?.email || token?.email || ''}`.trim().toLowerCase();
      const credentialUser = credentialUsersByEmail.get(tokenEmail);

      if (account?.provider === 'credentials') {
        token.role = credentialUser?.role || 'seller';
      } else if (account) {
        token.role = 'seller';
      } else if (typeof token.role !== 'string') {
        token.role = credentialUser?.role || 'seller';
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { role?: string }).role =
          typeof token.role === 'string' ? token.role : 'seller';
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
