export type IssueType = 'epic' | 'story' | 'task' | 'bug';
export type IssueStatus = 'new' | 'in_progress' | 'done';
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';
export type LinkType = 'blocks' | 'relates' | 'depends_on' | 'parent_of';

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Issue {
  id: string;
  project_id: string;
  key: string;
  type: IssueType;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assignee: string | null;
  labels: string[];
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface Comment {
  id: string;
  issue_id: string;
  author: string;
  body: string;
  created_at: string;
}

export interface IssueLink {
  id: string;
  source_id: string;
  target_id: string;
  type: LinkType;
  created_at: string;
}

export interface HistoryEntry {
  id: string;
  issue_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  author: string;
  created_at: string;
}
