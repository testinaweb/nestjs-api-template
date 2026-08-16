import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { TaskEntity } from '#src/entities/task.entity.js';
import { TasksService } from './tasks.service.js';

describe('TasksService', () => {
  function makeService(repo: Partial<Repository<TaskEntity>>): TasksService {
    return new TasksService(repo as Repository<TaskEntity>);
  }

  it('create() saves a new task', async () => {
    const created = { title: 'Write tests' } as TaskEntity;
    const saved = { ...created, id: '1' } as TaskEntity;
    const repo = {
      create: jest.fn().mockReturnValue(created),
      save: jest.fn().mockResolvedValue(saved),
    };

    const service = makeService(repo);
    await expect(service.create({ title: 'Write tests' })).resolves.toEqual(
      saved,
    );
    expect(repo.create).toHaveBeenCalledWith({ title: 'Write tests' });
    expect(repo.save).toHaveBeenCalledWith(created);
  });

  it('findOne() throws NotFoundException for an unknown id', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) };

    const service = makeService(repo);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update() merges the DTO onto the existing task', async () => {
    const existing = { id: '1', title: 'Old', done: false } as TaskEntity;
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest
        .fn()
        .mockImplementation((task: TaskEntity) => Promise.resolve(task)),
    };

    const service = makeService(repo);
    const result = await service.update('1', { done: true });
    expect(result).toEqual({ id: '1', title: 'Old', done: true });
  });

  it('remove() soft-removes the task', async () => {
    const existing = { id: '1' } as TaskEntity;
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      softRemove: jest.fn().mockResolvedValue(existing),
    };

    const service = makeService(repo);
    await service.remove('1');
    expect(repo.softRemove).toHaveBeenCalledWith(existing);
  });
});
