import { formatRelativeTime } from '../utils';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return "just now" for times less than 60 seconds ago', () => {
    // 30 seconds ago
    const date = new Date('2024-01-01T11:59:30Z').toISOString();
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('should return minutes ago for times less than 60 minutes ago', () => {
    // 30 minutes ago
    const date = new Date('2024-01-01T11:30:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('30m ago');
  });

  it('should return hours ago for times less than 24 hours ago', () => {
    // 4 hours ago
    const date = new Date('2024-01-01T08:00:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('4h ago');
  });

  it('should return days ago for times less than 7 days ago', () => {
    // 3 days ago
    const date = new Date('2023-12-29T12:00:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('3d ago');
  });

  it('should return formatted date for times 7 days ago or more', () => {
    // 10 days ago: 2023-12-22T12:00:00Z
    const date = new Date('2023-12-22T12:00:00Z').toISOString();
    const result = formatRelativeTime(date);

    // The format is "Month DD, YYYY, HH:MM PM/AM"
    // e.g. "Dec 22, 2023, 12:00 PM"
    // We check that it contains the date components and not "ago"
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
    expect(result).toContain('Dec 22, 2023');
  });

  it('should handle dates in the future gracefully', () => {
    // 1 minute in the future
    const date = new Date('2024-01-01T12:01:00Z').toISOString();
    // The implementation calculates diff based on now - date.
    // If date is in future, diff is negative.
    // diffSecs will be negative.
    // implementation: if (diffSecs < 60) return 'just now';
    // So negative diffSecs < 60 is true.
    expect(formatRelativeTime(date)).toBe('just now');
  });
});
