import { describe, expect, it } from 'vitest';
import {
  commentMutationResult,
  issueMutationResult,
  issueSummary,
  projectSummary,
} from '../src/mcp/payloads.js';
import type { Comment, Issue, Project } from '../src/types.js';

const project: Project = {
  id: 'project-1',
  key: 'COO',
  name: 'Operations',
  description: '# Large project description',
  created_at: '2026-08-17T12:00:00.000Z',
  updated_at: '2026-08-17T12:01:00.000Z',
};

const issue: Issue = {
  id: 'issue-1',
  project_id: project.id,
  key: 'COO-1',
  type: 'task',
  title: 'Review pipeline',
  description: '# Large issue description',
  status: 'in_progress',
  priority: 'high',
  assignee: 'sales',
  labels: ['sales'],
  version: 4,
  created_at: project.created_at,
  updated_at: project.updated_at,
  resolved_at: null,
};

const comment: Comment = {
  id: 'comment-1',
  issue_id: issue.id,
  author: 'sales',
  body: '# Large comment body',
  created_at: project.updated_at,
};

describe('MCP discovery and mutation payloads', () => {
  it('keeps project and issue collections metadata-only', () => {
    expect(projectSummary(project)).not.toHaveProperty('description');
    expect(issueSummary(issue)).not.toHaveProperty('description');
    expect(issueSummary(issue)).toMatchObject({
      key: 'COO-1',
      title: 'Review pipeline',
      status: 'in_progress',
      priority: 'high',
      assignee: 'sales',
    });
  });

  it('does not echo issue descriptions or comment bodies after writes', () => {
    expect(issueMutationResult(issue, ['status'])).toEqual({
      id: 'issue-1',
      key: 'COO-1',
      status: 'in_progress',
      version: 4,
      updated_at: project.updated_at,
      changed_fields: ['status'],
    });
    expect(commentMutationResult(comment)).not.toHaveProperty('body');
    expect(commentMutationResult(comment)).toMatchObject({
      id: 'comment-1',
      issue_id: 'issue-1',
    });
  });
});
