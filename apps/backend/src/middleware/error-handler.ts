import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ErrorResponse } from '../dto';

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const error = err as {
    type?: string;
    status?: number;
    statusCode?: number;
    message?: string;
  } | null;

  if (err instanceof ZodError) {
    const payload: ErrorResponse = {
      code: 'validation_error',
      message: 'Invalid request payload',
      details: err.flatten()
    };
    return res.status(400).json(payload);
  }

  if (error?.type === 'entity.too.large' || error?.status === 413 || error?.statusCode === 413) {
    const payload: ErrorResponse = {
      code: 'payload_too_large',
      message: 'Arquivo muito grande. Use uma imagem menor.'
    };
    return res.status(413).json(payload);
  }

  if (err instanceof SyntaxError && /JSON/i.test(error?.message || '')) {
    const payload: ErrorResponse = {
      code: 'invalid_json',
      message: 'JSON invalido no corpo da requisicao.'
    };
    return res.status(400).json(payload);
  }

  const payload: ErrorResponse = {
    code: 'internal_error',
    message: 'Unexpected error'
  };

  console.error(err);

  return res.status(500).json(payload);
};
