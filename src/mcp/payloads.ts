import type { Comment, Issue, Project } from '../types.js';

export type ProjectSummary = Pick<Project, 'id' | 'key' | 'name' | 'updated_at'>;

export type IssueSummary = Omit<Issue, 'description'>;

export type IssueMutationResult = Pick<Issue, 'id' | 'key' | 'status' | 'updated_at'> & {
  changed_fields: string[];
};

export type CommentMutationResult = Omit<Comment, 'body'>;

export function projectSummary(project: Project): ProjectSummary {
  const { id, key, name, updated_at } = project;
  return { id, key, name, updated_at };
}

export function issueSummary(issue: Issue): IssueSummary {
  const { description: _description, ...summary } = issue;
  return summary;
}

export function issueMutationResult(
  issue: Issue,
  changedFields: string[],
): IssueMutationResult {
  const { id, key, status, updated_at } = issue;
  return { id, key, status, updated_at, changed_fields: changedFields };
}

export function commentMutationResult(comment: Comment): CommentMutationResult {
  const { body: _body, ...result } = comment;
  return result;
}
