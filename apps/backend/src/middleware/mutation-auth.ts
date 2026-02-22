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
  return path === '/storefront/orders';
};

export const requireMutationAuth = (req: Request, res: Response, next: NextFunction) => {
  const method = req.method.toUpperCase();
  if (!WRITE_METHODS.has(method)) {
    return next();
  }

  if (isPublicWriteRoute(req)) {
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
