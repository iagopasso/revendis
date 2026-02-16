import { z } from 'zod';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const roleSchema = z.string().trim().min(1).max(40);
const pixKeyTypeSchema = z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']);
const subscriptionStatusSchema = z.enum(['active', 'trial', 'overdue', 'canceled']);
const colorHexSchema = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/);
const subdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(48);

export const settingsAccountUpdateSchema = z
  .object({
    ownerName: z.string().trim().min(1).max(120).optional(),
    ownerEmail: z.string().trim().email().max(255).optional(),
    ownerPhone: z.string().trim().min(6).max(30).optional(),
    businessName: z.string().trim().min(1).max(160).optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Informe ao menos um campo para atualizar.'
  });

export const settingsSubscriptionUpdateSchema = z
  .object({
    plan: z.string().trim().min(1).max(80).optional(),
    status: subscriptionStatusSchema.optional(),
    renewalDate: dateOnlySchema.optional(),
    monthlyPrice: z.number().min(0).max(999999).optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Informe ao menos um campo para atualizar.'
  });

export const settingsPixUpdateSchema = z
  .object({
    keyType: pixKeyTypeSchema.optional(),
    keyValue: z.string().trim().min(1).max(200).optional(),
    holderName: z.string().trim().min(1).max(160).optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Informe ao menos um campo para atualizar.'
  });

export const settingsAlertUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    daysBeforeDue: z.number().int().min(0).max(60).optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Informe ao menos um campo para atualizar.'
  });

export const settingsStorefrontUpdateSchema = z
  .object({
    shopName: z.string().trim().min(1).max(160).optional(),
    subdomain: subdomainSchema.optional(),
    shopColor: colorHexSchema.optional(),
    onlyStockProducts: z.boolean().optional(),
    showOutOfStockProducts: z.boolean().optional(),
    filterByCategory: z.boolean().optional(),
    filterByBrand: z.boolean().optional(),
    filterByPrice: z.boolean().optional(),
    whatsapp: z.string().trim().max(30).optional(),
    showWhatsappButton: z.boolean().optional(),
    selectedBrands: z.array(z.string().trim().min(1).max(160)).max(40).optional(),
    selectedCategories: z.array(z.string().trim().min(1).max(160)).max(40).optional(),
    priceFrom: z.string().trim().max(30).optional(),
    priceTo: z.string().trim().max(30).optional(),
    logoUrl: z.string().trim().max(4000).optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Informe ao menos um campo para atualizar.'
  });

export const accessMemberInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    role: roleSchema.optional(),
    active: z.boolean().optional()
  })
  .strict();

export const accessMemberUpdateSchema = accessMemberInputSchema
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Informe ao menos um campo para atualizar.'
  });
