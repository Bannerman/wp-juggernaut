/**
 * Prompt template storage: user dir only, built-in generic defaults.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getTemplate, saveTemplate, getTemplateVersions, resetTemplate } from '../prompt-templates';
import { getBuiltInTemplate } from '../prompt-template-defaults';

describe('prompt template storage', () => {
  let dir: string;
  const original = process.env.JUGGERNAUT_CONFIG_DIR;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jugg-templates-'));
    process.env.JUGGERNAUT_CONFIG_DIR = dir;
  });

  afterEach(() => {
    process.env.JUGGERNAUT_CONFIG_DIR = original;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns the built-in default when no user template exists', () => {
    expect(getTemplate('ai-fill')?.content).toBe(getBuiltInTemplate('ai-fill'));
  });

  it('saves edits and versions to the user dir, not the app dir', () => {
    saveTemplate('faq', 'first');
    saveTemplate('faq', 'second');
    const faqDir = path.join(dir, 'prompt-templates', 'faq');
    expect(fs.readFileSync(path.join(faqDir, 'template.md'), 'utf-8')).toBe('second');
    expect(getTemplate('faq')?.content).toBe('second');
    const versions = getTemplateVersions('faq');
    expect(versions[0].filename).toBe('template.md');
    expect(versions).toHaveLength(2);
    expect(fs.existsSync(path.join(process.cwd(), 'prompt-templates', 'faq', 'template.md'))).toBe(false);
  });

  it('reset writes the built-in default to the user template', () => {
    saveTemplate('featured-image', 'custom');
    resetTemplate('featured-image');
    expect(getTemplate('featured-image')?.content).toBe(getBuiltInTemplate('featured-image'));
  });
});
