import { z } from 'zod';

export const productInputSchema = z
  .object({
    name: z.string().min(1),
    sku: z.string().min(1),
    brand: z.string().min(1).optional(),
    barcode: z.string().optional(),
    imageUrl: z.string().min(1).optional(),
    price: z.number().nonnegative(),
    cost: z.number().nonnegative().optional(),
    stock: z.number().int().optional(),
    expiresAt: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    active: z.boolean().optional()
  })
  .strict();

export const productUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    brand: z.string().min(1).optional(),
    barcode: z.string().optional(),
    imageUrl: z.string().min(1).optional(),
    price: z.number().nonnegative().optional(),
    cost: z.number().nonnegative().optional(),
    expiresAt: z.string().optional(),
    active: z.boolean().optional(),
    categoryId: z.string().uuid().optional()
  })
  .strict();

export const categoryInputSchema = z
  .object({
    name: z.string().min(1),
    color: z.string().min(1).optional()
  })
  .strict();

export const categoryUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    color: z.string().min(1).optional()
  })
  .strict();

export const inventoryAdjustmentSchema = z
  .object({
    sku: z.string().min(1),
    quantity: z.number().int(),
    reason: z.string().min(1),
    storeId: z.string().optional(),
    cost: z.number().nonnegative().optional(),
    expiresAt: z.string().optional()
  })
  .strict();

export const inventoryTransferSchema = z
  .object({
    sku: z.string().min(1),
    quantity: z.number().int(),
    fromStoreId: z.string().min(1),
    toStoreId: z.string().min(1)
  })
  .strict();

export const inventoryReturnSchema = z
  .object({
    saleId: z.string().min(1),
    items: z.array(
      z
        .object({
          sku: z.string().min(1),
          quantity: z.number().int().positive()
        })
        .strict()
    ),
    condition: z.enum(['good', 'damaged']).optional()
  })
  .strict();

export const inventoryUnitUpdateSchema = z
  .object({
    cost: z.number().nonnegative().optional(),
    expiresAt: z.string().optional()
  })
  .strict();
