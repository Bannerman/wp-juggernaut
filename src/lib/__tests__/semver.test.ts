import { satisfies, compareVersions } from '../utils';

describe('Semver Utilities', () => {
  describe('compareVersions', () => {
    it('should compare major versions', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should compare minor versions', () => {
      expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
      expect(compareVersions('1.1.0', '1.2.0')).toBe(-1);
    });

    it('should compare patch versions', () => {
      expect(compareVersions('1.1.2', '1.1.1')).toBe(1);
      expect(compareVersions('1.1.1', '1.1.2')).toBe(-1);
    });

    it('should handle "v" prefix', () => {
      expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', 'v1.0.0')).toBe(0);
      expect(compareVersions('v2.0.0', 'v1.0.0')).toBe(1);
    });

    it('should handle pre-release tags', () => {
      expect(compareVersions('1.0.0-alpha', '1.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.0-alpha')).toBe(1);
      expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
    });
  });

  describe('satisfies', () => {
    it('should handle exact matches', () => {
      expect(satisfies('1.2.3', '1.2.3')).toBe(true);
      expect(satisfies('1.2.4', '1.2.3')).toBe(false);
      expect(satisfies('1.2.3', 'v1.2.3')).toBe(true);
    });

    it('should handle operators', () => {
      expect(satisfies('1.2.3', '>=1.2.3')).toBe(true);
      expect(satisfies('1.2.4', '>=1.2.3')).toBe(true);
      expect(satisfies('1.2.2', '>=1.2.3')).toBe(false);
      expect(satisfies('1.2.4', '>1.2.3')).toBe(true);
      expect(satisfies('1.2.3', '>1.2.3')).toBe(false);
      expect(satisfies('1.2.3', '<=1.2.3')).toBe(true);
      expect(satisfies('1.2.2', '<=1.2.3')).toBe(true);
      expect(satisfies('1.2.4', '<=1.2.3')).toBe(false);
      expect(satisfies('1.2.2', '<1.2.3')).toBe(true);
      expect(satisfies('1.2.3', '<1.2.3')).toBe(false);
    });

    it('should handle caret range (^)', () => {
      expect(satisfies('1.2.3', '^1.2.3')).toBe(true);
      expect(satisfies('1.9.9', '^1.2.3')).toBe(true);
      expect(satisfies('2.0.0', '^1.2.3')).toBe(false);

      // 0.x.y cases
      expect(satisfies('0.1.2', '^0.1.2')).toBe(true);
      expect(satisfies('0.1.3', '^0.1.2')).toBe(true);
      expect(satisfies('0.2.0', '^0.1.2')).toBe(false);

      // 0.0.x cases
      expect(satisfies('0.0.1', '^0.0.1')).toBe(true);
      expect(satisfies('0.0.2', '^0.0.1')).toBe(false);
    });

    it('should handle tilde range (~)', () => {
      expect(satisfies('1.2.3', '~1.2.3')).toBe(true);
      expect(satisfies('1.2.9', '~1.2.3')).toBe(true);
      expect(satisfies('1.3.0', '~1.2.3')).toBe(false);
    });

    it('should handle wildcards', () => {
      expect(satisfies('1.2.3', '*')).toBe(true);
      expect(satisfies('1.2.3', '')).toBe(true);
    });
  });
});
