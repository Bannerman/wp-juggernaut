import fs from 'fs';
import path from 'path';
import { getTemplate } from '../prompt-templates';

jest.mock('fs');

describe('prompt-templates', () => {
  describe('getTemplate', () => {
    beforeEach(() => {
      jest.resetAllMocks(); // Critical: Reset return values and implementations, not just call counts
    });

    it('returns null for an unknown template ID', () => {
      // ensureDirectories uses fs.existsSync and fs.mkdirSync
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = getTemplate('unknown-template-id');
      expect(result).toBeNull();
    });

    it('returns custom template content when the file exists', () => {
      const mockContent = 'Custom test template content';
      const mockDate = new Date('2024-01-01T00:00:00.000Z');

      (fs.existsSync as jest.Mock).mockImplementation((pathStr) => {
        return true; // Pretend directories and the file exist
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(mockContent);
      (fs.statSync as jest.Mock).mockReturnValue({ mtime: mockDate });

      const result = getTemplate('ai-fill');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('ai-fill');
      expect(result?.name).toBe('AI Fill');
      expect(result?.content).toBe(mockContent);
      expect(result?.updatedAt).toBe(mockDate.toISOString());
    });

    it('returns default template content when the file does not exist', () => {
      jest.useFakeTimers();
      const mockDate = new Date('2024-02-02T00:00:00.000Z');
      jest.setSystemTime(mockDate);

      // The main file does not exist, trigger the fallback block.
      // Notice the source code uses `fs.existsSync(templatePath)` in the if/else block!
      (fs.existsSync as jest.Mock).mockImplementation((pathStr) => {
        if (typeof pathStr === 'string' && pathStr.endsWith('template.md')) {
          return false; // The template file itself doesn't exist
        }
        return true; // Directories exist
      });

      (fs.readFileSync as jest.Mock).mockImplementation(() => {
         throw new Error('ENOENT'); // Double check by making sure reading fails
      });

      const result = getTemplate('ai-fill');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('ai-fill');
      expect(result?.name).toBe('AI Fill');
      // The default 'ai-fill' template content should contain these markers
      expect(result?.content).toContain('Please provide content for a resource');
      expect(result?.updatedAt).toBe(mockDate.toISOString());

      jest.useRealTimers();
    });
  });
});
