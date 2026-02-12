import { decodeHtmlEntities } from '../utils';

describe('decodeHtmlEntities', () => {
  it('should return empty string for empty input', () => {
    expect(decodeHtmlEntities('')).toBe('');
  });

  it('should return original text if no entities present', () => {
    const text = 'Hello World';
    expect(decodeHtmlEntities(text)).toBe(text);
  });

  it('should decode numeric entities', () => {
    expect(decodeHtmlEntities('&#038;')).toBe('&');
    expect(decodeHtmlEntities('&#123;')).toBe('{');
    expect(decodeHtmlEntities('&#38;')).toBe('&');
    expect(decodeHtmlEntities('Hello &#38; World')).toBe('Hello & World');
  });

  it('should decode named entities', () => {
    const cases = [
      ['&amp;', '&'],
      ['&lt;', '<'],
      ['&gt;', '>'],
      ['&quot;', '"'],
      ['&apos;', "'"],
      ['&nbsp;', ' '],
      ['&ndash;', '\u2013'],
      ['&mdash;', '\u2014'],
      ['&lsquo;', '\u2018'],
      ['&rsquo;', '\u2019'],
      ['&ldquo;', '\u201C'],
      ['&rdquo;', '\u201D'],
      ['&hellip;', '\u2026'],
    ];

    cases.forEach(([input, expected]) => {
      expect(decodeHtmlEntities(input)).toBe(expected);
    });
  });

  it('should handle mixed entities and text', () => {
    const input = 'This &amp; that &lt;b&gt;bold&lt;/b&gt; &#038; more';
    const expected = 'This & that <b>bold</b> & more';
    expect(decodeHtmlEntities(input)).toBe(expected);
  });

  it('should handle multiple occurrences of the same entity', () => {
    const input = 'One &amp; Two &amp; Three';
    const expected = 'One & Two & Three';
    expect(decodeHtmlEntities(input)).toBe(expected);
  });

  it('should handle unsupported entities gracefully', () => {
    const input = '&unknown; entity';
    expect(decodeHtmlEntities(input)).toBe(input);
  });
});
