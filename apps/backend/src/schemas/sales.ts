import { z } from 'zod';

export const saleItemSchema = z
  .object({
    sku: z.string().min(1),
    quantity: z.number().int().positive(),
    price: z.number().nonnegative()
  })
  .strict();

export const paymentSchema = z
  .object({
    method: z.string().min(1),
    amount: z.number().nonnegative()
  })
  .strict();

export const saleInputSchema = z
  .object({
    storeId: z.string().optional(),
    items: z.array(saleItemSchema).min(1),
    discounts: z.array(z.record(z.unknown())).optional(),
    payments: z.array(paymentSchema).optional()
  })
  .strict();
