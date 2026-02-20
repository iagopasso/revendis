import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Facebook from 'next-auth/providers/facebook';
import Google from 'next-auth/providers/google';

const providers: NonNullable<NextAuthConfig['providers']> = [];
const allowedEmails = (process.env.AUTH_ALLOWED_EMAILS || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const adminEmail = (process.env.AUTH_ADMIN_EMAIL || 'admin@revendis.local').trim().toLowerCase();
const adminPassword = process.env.AUTH_ADMIN_PASSWORD || 'Admin@123456';
const adminName = (process.env.AUTH_ADMIN_NAME || 'Administrador').trim() || 'Administrador';

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
      if (email !== adminEmail || password !== adminPassword) return null;

      return {
        id: 'local-admin',
        name: adminName,
        email: adminEmail
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

      if (allowedEmails.length === 0) return true;
      const email = (user.email || '').trim().toLowerCase();
      if (email === adminEmail) return true;
      return !!email && allowedEmails.includes(email);
    }
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-only-secret-change-me'
});
