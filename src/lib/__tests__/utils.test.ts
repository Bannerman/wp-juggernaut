import { stripHtml } from '../utils';

describe('stripHtml', () => {
  it('should remove simple HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
  });

  it('should handle attributes', () => {
    expect(stripHtml('<div class="foo">Hello</div>')).toBe('Hello');
  });

  it('should handle nested tags', () => {
    expect(stripHtml('<div><p>Hello</p></div>')).toBe('Hello');
  });

  it('should handle malformed tags (naive implementation might fail)', () => {
    // Current implementation uses <[^>]*> which stops at first >
    // <div title=">">Hello</div> -> matches <div title="> -> result ">Hello</div>
    expect(stripHtml('<div title=">">Hello</div>')).toBe('Hello');
  });

  it('should remove self-closing tags', () => {
    expect(stripHtml('<br/>Hello')).toBe('Hello');
    expect(stripHtml('<img src="foo.jpg" />Hello')).toBe('Hello');
  });

  it('should return text as is if no html', () => {
     expect(stripHtml('Hello')).toBe('Hello');
  });

  it('should return empty string for empty input', () => {
     expect(stripHtml('')).toBe('');
  });
});
