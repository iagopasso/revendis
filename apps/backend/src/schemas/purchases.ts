import { z } from 'zod';

const purchaseStatusSchema = z.enum(['pending', 'received', 'cancelled']);

export const purchaseInputSchema = z
  .object({
    supplier: z.string().min(1),
    total: z.number().positive(),
    items: z.number().int().positive(),
    brand: z.string().optional(),
    status: purchaseStatusSchema.optional(),
    purchaseDate: z.string().optional()
  })
  .strict();

export const purchaseStatusUpdateSchema = z
  .object({
    status: purchaseStatusSchema
  })
  .strict();
