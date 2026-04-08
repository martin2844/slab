import { z } from 'zod';

export const createLinkSchema = z.object({
  target_key: z.string().min(1),
  type: z.enum(['blocks', 'relates', 'depends_on', 'parent_of']),
});

export type CreateLink = z.infer<typeof createLinkSchema>;
