import { z } from 'zod';

export const customerInputSchema = z
  .object({
    name: z.string().min(1),
    phone: z.string().min(5),
    email: z.string().email().optional(),
    birthDate: z.string().optional(),
    description: z.string().max(4000).optional(),
    photoUrl: z.string().max(4000).optional(),
    cpfCnpj: z.string().max(18).optional(),
    cep: z.string().max(9).optional(),
    street: z.string().max(255).optional(),
    number: z.string().max(30).optional(),
    complement: z.string().max(255).optional(),
    neighborhood: z.string().max(255).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(2).optional(),
    tags: z.array(z.string().min(1).max(40)).max(40).optional()
  })
  .strict();

export const customerUpdateSchema = customerInputSchema
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Informe ao menos um campo para atualizar.'
  });
