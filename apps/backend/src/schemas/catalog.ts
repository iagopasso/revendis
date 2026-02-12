import { z } from 'zod';

const categorySchema = z.string().min(1);
const brandSchema = z.string().min(1);

export const naturaConsultantCatalogSchema = z
  .object({
    login: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    categories: z.array(categorySchema).optional(),
    limit: z.number().int().positive().max(1000).optional(),
    inStockOnly: z.boolean().optional(),
    deactivateMissing: z.boolean().optional(),
    classifyBrand: z.string().min(1).optional()
  })
  .strict();

export const catalogBrandsSyncSchema = z
  .object({
    brands: z.array(brandSchema).optional(),
    limit: z.number().int().positive().max(2000).optional(),
    inStockOnly: z.boolean().optional(),
    deactivateMissing: z.boolean().optional(),
    allowSampleFallback: z.boolean().optional()
  })
  .strict();

export const catalogBrandsPreloadSchema = z
  .object({
    brands: z.array(brandSchema).optional(),
    limit: z.number().int().positive().max(10000).optional(),
    inStockOnly: z.boolean().optional(),
    clearMissing: z.boolean().optional(),
    allowSampleFallback: z.boolean().optional(),
    maxAgeHours: z.number().int().positive().max(24 * 30).optional(),
    force: z.boolean().optional()
  })
  .strict();

const manualPreloadedProductSchema = z
  .object({
    sourceBrand: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    barcode: z.string().min(1).optional(),
    name: z.string().min(1),
    brand: z.string().min(1).optional(),
    sourceLineBrand: z.string().min(1).optional(),
    price: z.union([z.number(), z.string()]).optional(),
    purchasePrice: z.union([z.number(), z.string()]).optional(),
    inStock: z.union([z.boolean(), z.number(), z.string()]).optional(),
    imageUrl: z.string().min(1).optional(),
    sourceCategory: z.string().min(1).optional(),
    sourceUrl: z.string().min(1).optional()
  })
  .strict();

export const catalogPreloadedManualImportSchema = z
  .object({
    sourceBrand: z.string().min(1).optional(),
    clearMissing: z.boolean().optional(),
    products: z.array(manualPreloadedProductSchema).min(1).max(50000)
  })
  .strict();

const catalogWebsiteCollectSchema = z
  .object({
    siteUrl: z.string().url(),
    productUrls: z.array(z.string().url()).max(500).optional(),
    pathHints: z.array(z.string().min(1)).max(30).optional(),
    maxPages: z.number().int().positive().max(400).optional()
  })
  .strict();

const catalogMagazineCollectSchema = z
  .object({
    pdfPath: z.string().min(1).optional(),
    pdfUrl: z.string().url().optional(),
    pdfHeaders: z.record(z.string(), z.string()).optional(),
    limit: z.number().int().positive().max(50000).optional(),
    inStockOnly: z.boolean().optional(),
    enrichWithCatalog: z.boolean().optional()
  })
  .strict()
  .refine((value) => Boolean(value.pdfPath || value.pdfUrl), {
    message: 'Informe pdfPath ou pdfUrl para coleta por revista.'
  });

export const catalogPreloadedCollectSchema = z
  .object({
    sourceBrand: z.string().min(1).optional(),
    clearMissing: z.boolean().optional(),
    mode: z.enum(['website', 'magazine']),
    website: catalogWebsiteCollectSchema.optional(),
    magazine: catalogMagazineCollectSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === 'website' && !value.website) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['website'],
        message: 'Informe os dados de website para mode=website.'
      });
    }
    if (value.mode === 'magazine' && !value.magazine) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['magazine'],
        message: 'Informe os dados de magazine para mode=magazine.'
      });
    }
  });

export const naturaMagazineCatalogSchema = z
  .object({
    pdfPath: z.string().min(1).optional(),
    pdfUrl: z.string().url().optional(),
    pdfHeaders: z.record(z.string(), z.string()).optional(),
    limit: z.number().int().positive().max(50000).optional(),
    inStockOnly: z.boolean().optional(),
    enrichWithCatalog: z.boolean().optional(),
    clearMissing: z.boolean().optional()
  })
  .strict()
  .refine((value) => Boolean(value.pdfPath || value.pdfUrl), {
    message: 'Informe pdfPath ou pdfUrl.'
  });
