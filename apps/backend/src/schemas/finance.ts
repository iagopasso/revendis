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

export const receivableUpdateSchema = z
  .object({
    amount: z.number().positive().optional(),
    dueDate: z.string().min(1).optional(),
    method: z.string().optional()
  })
  .strict();

export const financeExpenseInputSchema = z
  .object({
    description: z.string().min(1),
    amount: z.number().positive(),
    dueDate: z.string().min(1),
    method: z.string().optional(),
    customerId: z.string().optional(),
    paid: z.boolean().optional()
  })
  .strict();

export const financeExpensePaySchema = z
  .object({
    paidAt: z.string().optional()
  })
  .strict();
