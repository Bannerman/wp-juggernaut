import { stripHtml } from '../utils';

describe('stripHtml', () => {
  it('removes simple tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
  });

  it('removes nested tags', () => {
    expect(stripHtml('<div><p>Hello</p></div>')).toBe('Hello');
  });

  it('handles attributes', () => {
    expect(stripHtml('<a href="https://example.com">Link</a>')).toBe('Link');
  });

  it('handles self-closing tags', () => {
    expect(stripHtml('Hello<br/>World')).toBe('HelloWorld');
  });

  // This test case demonstrates the flaw in the naive implementation
  // The naive regex /<[^>]*>/g stops at the first >, so <div title=">"> becomes "">Content</div>" which is wrong.
  // Actually, wait. <div title=">">
  // The regex matches <div title=">
  // So result is ">Content</div>"
  // Let's verify this behavior with a test.
  it('handles attributes with greater-than sign', () => {
    const input = '<div title=">">Content</div>';
    // Naive implementation: returns '">Content</div>' (incorrect)
    // Correct implementation: returns 'Content'
    // We expect 'Content' eventually, but for now I'll check what it does.
    // I will write the expectation for the correct behavior and see it fail.
    expect(stripHtml(input)).toBe('Content');
  });

  it('handles script tags (keeps content)', () => {
    expect(stripHtml('<script>alert(1)</script>')).toBe('alert(1)');
  });
});
