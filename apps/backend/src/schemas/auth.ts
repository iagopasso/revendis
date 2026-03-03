import { z } from 'zod';

export const authRegisterSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    password: z.string().min(6).max(72)
  })
  .strict();

export const authLoginSchema = z
  .object({
    email: z.string().trim().email().max(255),
    password: z.string().min(1).max(72)
  })
  .strict();

export const authSocialSyncSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(255)
  })
  .strict();
