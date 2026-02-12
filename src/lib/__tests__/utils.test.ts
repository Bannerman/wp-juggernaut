import { decodeHtmlEntities } from '../utils';

describe('decodeHtmlEntities', () => {
  it('should return empty string for empty input', () => {
    expect(decodeHtmlEntities('')).toBe('');
  });

  it('should decode basic named entities', () => {
    expect(decodeHtmlEntities('&amp;')).toBe('&');
    expect(decodeHtmlEntities('&lt;')).toBe('<');
    expect(decodeHtmlEntities('&gt;')).toBe('>');
    expect(decodeHtmlEntities('&quot;')).toBe('"');
    expect(decodeHtmlEntities('&apos;')).toBe("'");
  });

  it('should decode numeric entities', () => {
    expect(decodeHtmlEntities('&#038;')).toBe('&');
    expect(decodeHtmlEntities('&#123;')).toBe('{');
  });

  it('should decode mixed content', () => {
    expect(decodeHtmlEntities('Hello &amp; Welcome')).toBe('Hello & Welcome');
  });

  it('should decode other named entities', () => {
    expect(decodeHtmlEntities('&copy;')).toBe('©');
    expect(decodeHtmlEntities('&reg;')).toBe('®');
    expect(decodeHtmlEntities('&euro;')).toBe('€');
  });

  it('should decode hex entities', () => {
    expect(decodeHtmlEntities('&#xA9;')).toBe('©');
  });
});
