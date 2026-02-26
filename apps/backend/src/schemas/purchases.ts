import { z } from 'zod';

const purchaseStatusSchema = z.enum(['pending', 'received', 'cancelled']);
const purchaseItemSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitCost: z.number().min(0).optional(),
    expiresAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
  })
  .strict();

export const purchaseInputSchema = z
  .object({
    supplier: z.string().min(1),
    total: z.number().positive(),
    items: z.number().int().positive(),
    brand: z.string().optional(),
    status: purchaseStatusSchema.optional(),
    purchaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    purchaseItems: z.array(purchaseItemSchema).optional()
  })
  .strict();

export const purchaseStatusUpdateSchema = z
  .object({
    status: purchaseStatusSchema
  })
  .strict();

export const purchaseUpdateSchema = z
  .object({
    supplier: z.string().min(1).optional(),
    total: z.number().positive().optional(),
    items: z.number().int().positive().optional(),
    brand: z.string().optional(),
    purchaseDate: z.string().optional(),
    dueDate: z.string().optional(),
    purchaseItems: z.array(purchaseItemSchema).optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar a compra.'
  });
