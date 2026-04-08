import { describe, it, expect, beforeEach } from 'vitest';
import * as projectSvc from '../src/services/project.js';
import * as issueSvc from '../src/services/issue.js';
import * as linkSvc from '../src/services/link.js';

describe('Link Service', () => {
  beforeEach(() => {
    projectSvc.createProject({ key: 'TEST', name: 'Test Project' });
    issueSvc.createIssue('TEST', { title: 'Issue A' });
    issueSvc.createIssue('TEST', { title: 'Issue B' });
    issueSvc.createIssue('TEST', { title: 'Issue C' });
  });

  describe('createLink', () => {
    it('creates a blocks link', () => {
      const link = linkSvc.createLink('TEST-1', {
        target_key: 'TEST-2',
        type: 'blocks',
      })!;

      expect(link).toMatchObject({
        type: 'blocks',
      });
      expect(link.source_id).toBeDefined();
      expect(link.target_id).toBeDefined();
    });

    it('creates a parent_of link', () => {
      const link = linkSvc.createLink('TEST-1', {
        target_key: 'TEST-2',
        type: 'parent_of',
      })!;

      expect(link.type).toBe('parent_of');
    });

    it('returns null for non-existent source', () => {
      expect(linkSvc.createLink('TEST-999', {
        target_key: 'TEST-1',
        type: 'blocks',
      })).toBeNull();
    });

    it('returns null for non-existent target', () => {
      expect(linkSvc.createLink('TEST-1', {
        target_key: 'TEST-999',
        type: 'blocks',
      })).toBeNull();
    });

    it('returns null for self-linking', () => {
      expect(linkSvc.createLink('TEST-1', {
        target_key: 'TEST-1',
        type: 'relates',
      })).toBeNull();
    });

    it('returns null for duplicate link', () => {
      linkSvc.createLink('TEST-1', { target_key: 'TEST-2', type: 'blocks' });
      expect(linkSvc.createLink('TEST-1', { target_key: 'TEST-2', type: 'blocks' })).toBeNull();
    });

    it('allows different link types between same issues', () => {
      const link1 = linkSvc.createLink('TEST-1', { target_key: 'TEST-2', type: 'blocks' });
      const link2 = linkSvc.createLink('TEST-1', { target_key: 'TEST-2', type: 'relates' });
      expect(link1).not.toBeNull();
      expect(link2).not.toBeNull();
    });
  });

  describe('listLinks', () => {
    it('returns outward and inward links', () => {
      linkSvc.createLink('TEST-1', { target_key: 'TEST-2', type: 'blocks' });
      linkSvc.createLink('TEST-3', { target_key: 'TEST-1', type: 'depends_on' });

      const links = linkSvc.listLinks('TEST-1')!;
      expect(links.outward).toHaveLength(1);
      expect(links.inward).toHaveLength(1);
      expect(links.outward[0].type).toBe('blocks');
      expect(links.inward[0].type).toBe('depends_on');
    });

    it('returns null for non-existent issue', () => {
      expect(linkSvc.listLinks('TEST-999')).toBeNull();
    });
  });

  describe('deleteLink', () => {
    it('deletes a link', () => {
      const link = linkSvc.createLink('TEST-1', { target_key: 'TEST-2', type: 'blocks' })!;
      expect(linkSvc.deleteLink(link.id)).toBe(true);
      expect(linkSvc.listLinks('TEST-1')!.outward).toHaveLength(0);
    });

    it('returns false for non-existent link', () => {
      expect(linkSvc.deleteLink('fake-id')).toBe(false);
    });
  });
});
