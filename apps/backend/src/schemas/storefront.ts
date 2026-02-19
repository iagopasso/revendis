import { z } from 'zod';
import { saleItemSchema } from './sales';

export const storefrontOrderSchema = z
  .object({
    subdomain: z.string().trim().min(1).optional(),
    items: z.array(saleItemSchema).min(1),
    customer: z
      .object({
        name: z.string().min(1),
        phone: z
          .string()
          .trim()
          .regex(/^\+?[0-9()\s-]{10,20}$/, 'Telefone invalido'),
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

export const storefrontOrderAcceptSchema = z.preprocess(
  (value) => (value && typeof value === 'object' ? value : {}),
  z
    .object({
      customerId: z.string().uuid().optional(),
      customerName: z.string().trim().min(1).max(160).optional(),
      saleDate: z.string().trim().min(1).max(40).optional(),
      items: z
        .array(
          z
            .object({
              id: z.string().uuid().optional(),
              productId: z.string().uuid().optional(),
              sku: z.string().trim().min(1).optional(),
              quantity: z.number().int().nonnegative().optional(),
              price: z.number().nonnegative().optional(),
              unitIds: z.array(z.string().uuid()).optional()
            })
            .strict()
        )
        .optional()
    })
    .strict()
);
