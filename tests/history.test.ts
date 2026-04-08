import { describe, it, expect, beforeEach } from 'vitest';
import * as projectSvc from '../src/services/project.js';
import * as issueSvc from '../src/services/issue.js';
import * as historySvc from '../src/services/history.js';

describe('History Service', () => {
  beforeEach(() => {
    projectSvc.createProject({ key: 'TEST', name: 'Test Project' });
    issueSvc.createIssue('TEST', { title: 'History test' });
  });

  describe('getHistory', () => {
    it('records status changes', () => {
      issueSvc.updateIssue('TEST-1', { status: 'in_progress' }, 'alice');
      issueSvc.updateIssue('TEST-1', { status: 'done' }, 'alice');

      const history = historySvc.getHistory('TEST-1')!;

      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        field: 'status',
        old_value: 'new',
        new_value: 'in_progress',
        author: 'alice',
      });
      expect(history[1]).toMatchObject({
        field: 'status',
        old_value: 'in_progress',
        new_value: 'done',
        author: 'alice',
      });
    });

    it('records assignee changes', () => {
      issueSvc.updateIssue('TEST-1', { assignee: 'bob' }, 'system');

      const history = historySvc.getHistory('TEST-1')!;
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        field: 'assignee',
        old_value: null,
        new_value: 'bob',
      });
    });

    it('records multiple field changes in one update', () => {
      issueSvc.updateIssue('TEST-1', {
        status: 'in_progress',
        priority: 'high',
        assignee: 'charlie',
      }, 'system');

      const history = historySvc.getHistory('TEST-1')!;
      expect(history).toHaveLength(3);

      const fields = history.map(h => h.field);
      expect(fields).toContain('status');
      expect(fields).toContain('priority');
      expect(fields).toContain('assignee');
    });

    it('does not record unchanged fields', () => {
      issueSvc.updateIssue('TEST-1', { title: 'History test' }, 'system');

      const history = historySvc.getHistory('TEST-1')!;
      expect(history).toHaveLength(0);
    });

    it('returns empty array for issue with no changes', () => {
      const history = historySvc.getHistory('TEST-1')!;
      expect(history).toEqual([]);
    });

    it('returns null for non-existent issue', () => {
      expect(historySvc.getHistory('TEST-999')).toBeNull();
    });
  });
});
