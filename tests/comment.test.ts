import { describe, it, expect, beforeEach } from 'vitest';
import * as projectSvc from '../src/services/project.js';
import * as issueSvc from '../src/services/issue.js';
import * as commentSvc from '../src/services/comment.js';

describe('Comment Service', () => {
  beforeEach(() => {
    projectSvc.createProject({ key: 'TEST', name: 'Test Project' });
    issueSvc.createIssue('TEST', { title: 'Issue with comments' });
  });

  describe('addComment', () => {
    it('adds a comment to an issue', () => {
      const comment = commentSvc.addComment('TEST-1', {
        author: 'alice',
        body: 'This is a comment',
      })!;

      expect(comment).toMatchObject({
        issue_id: expect.any(String),
        author: 'alice',
        body: 'This is a comment',
      });
      expect(comment.id).toBeDefined();
      expect(comment.created_at).toBeDefined();
    });

    it('returns null for non-existent issue', () => {
      expect(commentSvc.addComment('TEST-999', {
        author: 'alice',
        body: 'Nope',
      })).toBeNull();
    });
  });

  describe('listComments', () => {
    it('lists comments in chronological order', () => {
      commentSvc.addComment('TEST-1', { author: 'alice', body: 'First' });
      commentSvc.addComment('TEST-1', { author: 'bob', body: 'Second' });

      const comments = commentSvc.listComments('TEST-1')!;
      expect(comments).toHaveLength(2);
      expect(comments[0].body).toBe('First');
      expect(comments[1].body).toBe('Second');
    });

    it('returns empty array when no comments', () => {
      const comments = commentSvc.listComments('TEST-1')!;
      expect(comments).toEqual([]);
    });

    it('returns null for non-existent issue', () => {
      expect(commentSvc.listComments('TEST-999')).toBeNull();
    });
  });

  describe('deleteComment', () => {
    it('deletes a comment', () => {
      const comment = commentSvc.addComment('TEST-1', {
        author: 'alice',
        body: 'To delete',
      })!;

      expect(commentSvc.deleteComment('TEST-1', comment.id)).toBe(true);
      expect(commentSvc.listComments('TEST-1')!).toHaveLength(0);
    });

    it('returns false for non-existent comment', () => {
      expect(commentSvc.deleteComment('TEST-1', 'fake-id')).toBe(false);
    });

    it('returns false for wrong issue', () => {
      const comment = commentSvc.addComment('TEST-1', {
        author: 'alice',
        body: 'Wrong issue',
      })!;

      issueSvc.createIssue('TEST', { title: 'Other issue' });
      expect(commentSvc.deleteComment('TEST-2', comment.id)).toBe(false);
    });
  });
});
