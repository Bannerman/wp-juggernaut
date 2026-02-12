import { pMap } from '../utils';

describe('pMap', () => {
  it('should limit concurrency', async () => {
    let activeTasks = 0;
    let maxActiveTasks = 0;
    const taskDuration = 50;

    const task = async () => {
      activeTasks++;
      maxActiveTasks = Math.max(maxActiveTasks, activeTasks);
      await new Promise((resolve) => setTimeout(resolve, taskDuration));
      activeTasks--;
      return 'done';
    };

    const items = [1, 2, 3, 4, 5];
    const concurrency = 2;

    const results = await pMap(items, task, concurrency);

    expect(results).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(maxActiveTasks).toBeLessThan(items.length); // Should be <= concurrency ideally, but exact timing might vary slightly
    expect(maxActiveTasks).toBeLessThanOrEqual(concurrency);
  });

  it('should handle errors gracefully', async () => {
    const items = [1, 2, 3];
    const concurrency = 2;
    const errorTask = async (item: number) => {
      if (item === 2) throw new Error('Failed');
      return item * 2;
    };

    await expect(pMap(items, errorTask, concurrency)).rejects.toThrow('Failed');
  });

  it('should process all items correctly', async () => {
    const items = [1, 2, 3, 4, 5];
    const concurrency = 2;
    const task = async (item: number) => item * 2;

    const results = await pMap(items, task, concurrency);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('should throw if concurrency is less than 1', async () => {
    const items = [1, 2, 3];
    const concurrency = 0;
    const task = async (item: number) => item * 2;

    await expect(pMap(items, task, concurrency)).rejects.toThrow(TypeError);
  });
});

describe('Promise.all baseline (unbounded concurrency)', () => {
  it('should run tasks concurrently without limit', async () => {
    let activeTasks = 0;
    let maxActiveTasks = 0;
    const taskDuration = 50;

    const task = async () => {
      activeTasks++;
      maxActiveTasks = Math.max(maxActiveTasks, activeTasks);
      await new Promise((resolve) => setTimeout(resolve, taskDuration));
      activeTasks--;
      return 'done';
    };

    const items = [1, 2, 3, 4, 5];

    await Promise.all(items.map(task));

    expect(maxActiveTasks).toBe(items.length);
  });
});
