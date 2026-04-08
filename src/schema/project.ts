import { z } from 'zod';

export const createProjectSchema = z.object({
  key: z.string().min(1).max(10).regex(/^[A-Z][A-Z0-9]*$/, 'Key must be uppercase alphanumeric, starting with a letter'),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
});

export type CreateProject = z.infer<typeof createProjectSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;
