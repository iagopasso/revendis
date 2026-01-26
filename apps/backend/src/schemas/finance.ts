import { z } from 'zod';

export const receivableInputSchema = z
  .object({
    saleId: z.string().min(1),
    amount: z.number().positive(),
    dueDate: z.string().min(1),
    method: z.string().optional()
  })
  .strict();

export const receivableSettleSchema = z
  .object({
    amount: z.number().positive(),
    settledAt: z.string().min(1)
  })
  .strict();
