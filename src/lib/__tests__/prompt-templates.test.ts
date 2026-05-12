import fs from 'fs';
import path from 'path';
import { getTemplateVersions } from '../prompt-templates';

jest.mock('fs');

describe('getTemplateVersions', () => {
  const TEMPLATES_DIR = path.join(process.cwd(), 'prompt-templates');
  const templateId = 'ai-fill';
  const templateDir = path.join(TEMPLATES_DIR, templateId);

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
      if (p === TEMPLATES_DIR || p === templateDir) return true;
      return false;
    });
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
  });

  it('should return empty array if template directory does not exist', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    const versions = getTemplateVersions(templateId);
    expect(versions).toEqual([]);
  });

  it('should ignore non-markdown files', () => {
    (fs.readdirSync as jest.Mock).mockReturnValue(['template.txt', '.DS_Store', 'image.png']);
    const versions = getTemplateVersions(templateId);
    expect(versions).toEqual([]);
  });

  it('should process and sort versions correctly with template.md always first', () => {
    const mockFiles = [
      'template-2024-01-14T10-30-00-000Z.md',
      'template.md',
      'template-2024-01-16T10-30-00-000Z.md',
    ];

    (fs.readdirSync as jest.Mock).mockReturnValue(mockFiles);

    (fs.statSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath.includes('template-2024-01-14')) {
        return { mtime: new Date('2024-01-14T10:30:00.000Z') };
      }
      if (filePath.includes('template-2024-01-16')) {
        return { mtime: new Date('2024-01-16T10:30:00.000Z') };
      }
      if (filePath.includes('template.md')) {
        return { mtime: new Date('2024-01-15T10:30:00.000Z') };
      }
      return { mtime: new Date() };
    });

    const versions = getTemplateVersions(templateId);

    expect(versions).toHaveLength(3);
    expect(versions[0].filename).toBe('template.md');
    expect(versions[0].displayDate).toBe('Current');

    expect(versions[1].filename).toBe('template-2024-01-16T10-30-00-000Z.md');
    expect(versions[1].timestamp).toBe('2024-01-16T10:30:00.000Z');

    expect(versions[2].filename).toBe('template-2024-01-14T10-30-00-000Z.md');
    expect(versions[2].timestamp).toBe('2024-01-14T10:30:00.000Z');
  });
});
