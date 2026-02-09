import { isValidExternalUrl } from '../url-validation';

describe('isValidExternalUrl', () => {
  it('should return true for https URLs', () => {
    expect(isValidExternalUrl('https://google.com')).toBe(true);
    expect(isValidExternalUrl('https://example.org/path?query=1')).toBe(true);
  });

  it('should return true for http URLs', () => {
    expect(isValidExternalUrl('http://localhost:3000')).toBe(true);
    expect(isValidExternalUrl('http://example.com')).toBe(true);
  });

  it('should return false for file URLs', () => {
    expect(isValidExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isValidExternalUrl('file://C:/Windows/System32/config/SAM')).toBe(false);
  });

  it('should return false for javascript URLs', () => {
    expect(isValidExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('should return false for data URLs', () => {
    expect(isValidExternalUrl('data:text/html,<html><body>Hacked</body></html>')).toBe(false);
  });

  it('should return false for invalid URLs', () => {
    expect(isValidExternalUrl('not-a-url')).toBe(false);
    expect(isValidExternalUrl('')).toBe(false);
    // @ts-ignore
    expect(isValidExternalUrl(null)).toBe(false);
  });

  it('should return false for other protocols', () => {
    expect(isValidExternalUrl('ftp://example.com')).toBe(false);
    expect(isValidExternalUrl('ssh://example.com')).toBe(false);
    expect(isValidExternalUrl('mailto:test@example.com')).toBe(false);
  });
});
