import { z } from 'zod';
import { saleItemSchema } from './sales';

export const storefrontOrderSchema = z
  .object({
    items: z.array(saleItemSchema).min(1),
    customer: z
      .object({
        name: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().email().optional()
      })
      .strict(),
    shipping: z
      .object({
        address: z.string().optional(),
        price: z.number().nonnegative().optional()
      })
      .strict()
      .optional()
  })
  .strict();
