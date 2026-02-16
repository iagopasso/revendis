import { z } from 'zod';

const brandSourceSchema = z.enum(['existing', 'catalog', 'manual']);

export const resellerBrandInputSchema = z
  .object({
    name: z.string().min(1).max(160),
    source: brandSourceSchema.optional(),
    sourceBrand: z.string().max(160).optional(),
    profitability: z.number().min(0).max(100).optional(),
    logoUrl: z.string().max(4000).optional()
  })
  .strict();

export const resellerBrandUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    source: brandSourceSchema.optional(),
    sourceBrand: z.string().trim().max(160).optional(),
    profitability: z.number().min(0).max(100).optional(),
    logoUrl: z.string().trim().max(4000).optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Informe ao menos um campo para atualizar.'
  });
