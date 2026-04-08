import { z } from 'zod';

export const createCommentSchema = z.object({
  author: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
});

export type CreateComment = z.infer<typeof createCommentSchema>;
