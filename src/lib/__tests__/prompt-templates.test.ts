import fs from 'fs';
import path from 'path';
import { getTemplate, getDefaultTemplate } from '../prompt-templates';

// Mock fs module
jest.mock('fs');

describe('getTemplate', () => {
  const mockReadFileSync = fs.readFileSync as jest.Mock;
  const mockExistsSync = fs.existsSync as jest.Mock;
  const mockStatSync = fs.statSync as jest.Mock;
  const mockMkdirSync = fs.mkdirSync as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null for unknown template ID', () => {
    const result = getTemplate('unknown-template-id');
    expect(result).toBeNull();
  });

  it('should return template content from file if it exists', () => {
    const templateId = 'ai-fill';
    const mockContent = 'Mock template content';
    const mockMtime = new Date('2023-01-01T12:00:00Z');

    // Mock file existence
    mockExistsSync.mockImplementation((filePath: string) => {
      // Return true for directories to avoid mkdir calls in this test
      // The implementation checks directories first, then the file
      // We can be loose here or precise.
      // prompt-templates dir and subdirs don't have extension usually
      if (!filePath.endsWith('.md')) return true;
      // Return true for the template file
      if (filePath.includes(templateId)) return true;
      return false;
    });

    mockReadFileSync.mockReturnValue(mockContent);
    mockStatSync.mockReturnValue({ mtime: mockMtime });

    const result = getTemplate(templateId);

    expect(result).toEqual({
      id: templateId,
      name: expect.any(String),
      description: expect.any(String),
      content: mockContent,
      updatedAt: mockMtime.toISOString(),
    });

    // Verify fs calls
    expect(mockExistsSync).toHaveBeenCalled();
    // Verify readFileSync was called with a path containing the templateId
    expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining(templateId), 'utf-8');
  });

  it('should return default template if file does not exist', () => {
    const templateId = 'ai-fill';
    const defaultContent = getDefaultTemplate(templateId);

    // Mock file missing
    mockExistsSync.mockImplementation((filePath: string) => {
      // Return true for directories
      if (!filePath.endsWith('.md')) return true;
      // Return false for file
      return false;
    });

    const result = getTemplate(templateId);

    expect(result).toEqual({
      id: templateId,
      name: expect.any(String),
      description: expect.any(String),
      content: defaultContent,
      updatedAt: expect.any(String),
    });

    // Verify fs calls
    expect(mockExistsSync).toHaveBeenCalled();
    // readFileSync should NOT be called for the file
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it('should ensure directories exist', () => {
    const templateId = 'ai-fill';

    // Mock directories missing initially
    mockExistsSync.mockReturnValue(false);

    getTemplate(templateId);

    // Expect mkdir to be called for base dir and template dir
    // TEMPLATES_DIR check
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining('prompt-templates'), { recursive: true });
    // specific template dir check
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining(templateId), { recursive: true });
  });
});
