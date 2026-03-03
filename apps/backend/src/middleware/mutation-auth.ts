import type { NextFunction, Request, Response } from 'express';
import { MUTATION_AUTH_TOKEN } from '../config';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const normalizePath = (path: string) => {
  if (!path) return '/';
  return path.replace(/\/+$/, '') || '/';
};

const extractBearerToken = (value: string | undefined) => {
  if (!value) return '';
  const [scheme, token] = value.trim().split(/\s+/, 2);
  if (!scheme || !token) return '';
  if (scheme.toLowerCase() !== 'bearer') return '';
  return token.trim();
};

const isPublicWriteRoute = (req: Request) => {
  if (req.method.toUpperCase() !== 'POST') return false;
  const path = normalizePath(req.path);
  if (path === '/storefront/orders') return true;
  if (path === '/storefront/payments/mercado-pago/webhook') return true;
  if (/^\/storefront\/orders\/[0-9a-f-]+\/payments\/confirm$/i.test(path)) return true;
  if (/^\/storefront\/orders\/[0-9a-f-]+\/cancel-public$/i.test(path)) return true;
  return false;
};

const hasAuthSessionCookie = (req: Request) => {
  const rawCookie = req.header('cookie') || '';
  if (!rawCookie) return false;
  return (
    rawCookie.includes('__Secure-authjs.session-token=') || rawCookie.includes('authjs.session-token=')
  );
};

export const requireMutationAuth = (req: Request, res: Response, next: NextFunction) => {
  const method = req.method.toUpperCase();
  if (!WRITE_METHODS.has(method)) {
    return next();
  }

  if (isPublicWriteRoute(req)) {
    return next();
  }

  // Web authenticated sessions can mutate without explicit mutation token.
  if (hasAuthSessionCookie(req)) {
    return next();
  }

  if (!MUTATION_AUTH_TOKEN) {
    return next();
  }

  const tokenFromHeader = req.header('x-mutation-token')?.trim() || '';
  const tokenFromAuth = extractBearerToken(req.header('authorization'));
  const providedToken = tokenFromHeader || tokenFromAuth;

  if (providedToken && providedToken === MUTATION_AUTH_TOKEN) {
    return next();
  }

  return res.status(401).json({
    code: 'unauthorized',
    message: 'Missing or invalid mutation token.'
  });
};
