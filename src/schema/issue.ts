import { z } from 'zod';
import type { IssueType, IssueStatus, IssuePriority } from '../types.js';

export const createIssueSchema = z.object({
  type: z.enum(['epic', 'story', 'task', 'bug']).default('task'),
  title: z.string().min(1).max(500),
  description: z.string().max(50000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  assignee: z.string().max(200).optional(),
  labels: z.array(z.string().max(100)).max(20).default([]),
});

export const updateIssueSchema = z.object({
  type: z.enum(['epic', 'story', 'task', 'bug']).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(50000).nullable().optional(),
  status: z.enum(['new', 'in_progress', 'done']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  assignee: z.string().max(200).nullable().optional(),
  labels: z.array(z.string().max(100)).max(20).optional(),
});

export const listIssuesQuerySchema = z.object({
  status: z.union([z.string(), z.array(z.string())]).optional().transform(v =>
    v ? (Array.isArray(v) ? v : [v]) as IssueStatus[] : undefined
  ),
  type: z.union([z.string(), z.array(z.string())]).optional().transform(v =>
    v ? (Array.isArray(v) ? v : [v]) as IssueType[] : undefined
  ),
  priority: z.union([z.string(), z.array(z.string())]).optional().transform(v =>
    v ? (Array.isArray(v) ? v : [v]) as IssuePriority[] : undefined
  ),
  assignee: z.string().optional(),
  label: z.union([z.string(), z.array(z.string())]).optional().transform(v =>
    v ? (Array.isArray(v) ? v : [v]) : undefined
  ),
  search: z.string().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateIssue = z.infer<typeof createIssueSchema>;
export type UpdateIssue = z.infer<typeof updateIssueSchema>;
export type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>;
