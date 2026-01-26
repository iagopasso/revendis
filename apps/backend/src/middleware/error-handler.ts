import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ErrorResponse } from '../dto';

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof ZodError) {
    const payload: ErrorResponse = {
      code: 'validation_error',
      message: 'Invalid request payload',
      details: err.flatten()
    };
    return res.status(400).json(payload);
  }

  const payload: ErrorResponse = {
    code: 'internal_error',
    message: 'Unexpected error'
  };

  return res.status(500).json(payload);
};
