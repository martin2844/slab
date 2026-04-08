import { describe, it, expect } from 'vitest';
import * as projectSvc from '../src/services/project.js';

describe('Project Service', () => {
  describe('createProject', () => {
    it('creates a project with all fields', () => {
      const project = projectSvc.createProject({
        key: 'MYAPP',
        name: 'My Application',
        description: 'A test project',
      });

      expect(project).toMatchObject({
        key: 'MYAPP',
        name: 'My Application',
        description: 'A test project',
      });
      expect(project.id).toBeDefined();
      expect(project.created_at).toBeDefined();
      expect(project.updated_at).toBeDefined();
    });

    it('creates a project without description', () => {
      const project = projectSvc.createProject({ key: 'TEST', name: 'Test' });
      expect(project.description).toBeNull();
    });

    it('throws on duplicate key', () => {
      projectSvc.createProject({ key: 'DUP', name: 'First' });
      expect(() => projectSvc.createProject({ key: 'DUP', name: 'Second' })).toThrow();
    });
  });

  describe('listProjects', () => {
    it('returns all projects', () => {
      projectSvc.createProject({ key: 'A1', name: 'Alpha' });
      projectSvc.createProject({ key: 'B2', name: 'Beta' });

      const projects = projectSvc.listProjects();
      expect(projects).toHaveLength(2);
    });

    it('returns empty array when no projects exist', () => {
      expect(projectSvc.listProjects()).toEqual([]);
    });
  });

  describe('getProjectByKey', () => {
    it('finds an existing project', () => {
      projectSvc.createProject({ key: 'FIND', name: 'Findable' });
      const project = projectSvc.getProjectByKey('FIND');
      expect(project?.name).toBe('Findable');
    });

    it('returns null for non-existent key', () => {
      expect(projectSvc.getProjectByKey('NOPE')).toBeNull();
    });
  });

  describe('updateProject', () => {
    it('updates name', () => {
      projectSvc.createProject({ key: 'UPD', name: 'Old Name' });
      const updated = projectSvc.updateProject('UPD', { name: 'New Name' });
      expect(updated?.name).toBe('New Name');
    });

    it('updates description', () => {
      projectSvc.createProject({ key: 'UPD2', name: 'Test' });
      const updated = projectSvc.updateProject('UPD2', { description: 'New desc' });
      expect(updated?.description).toBe('New desc');
    });

    it('returns null for non-existent project', () => {
      expect(projectSvc.updateProject('NOPE', { name: 'X' })).toBeNull();
    });
  });

  describe('deleteProject', () => {
    it('deletes an existing project', () => {
      projectSvc.createProject({ key: 'DEL', name: 'Deletable' });
      expect(projectSvc.deleteProject('DEL')).toBe(true);
      expect(projectSvc.getProjectByKey('DEL')).toBeNull();
    });

    it('returns false for non-existent project', () => {
      expect(projectSvc.deleteProject('NOPE')).toBe(false);
    });
  });
});
