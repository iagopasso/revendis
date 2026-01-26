import { z } from 'zod';

export const customerInputSchema = z
  .object({
    name: z.string().min(1),
    phone: z.string().min(5),
    email: z.string().email().optional()
  })
  .strict();
