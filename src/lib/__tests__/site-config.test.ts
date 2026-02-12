import fs from 'fs';
import os from 'os';
import path from 'path';
import { getConfig } from '../site-config';

// Mock fs and os modules
jest.mock('fs');
jest.mock('os', () => ({
  homedir: jest.fn(() => '/mock-home'),
}));

// Mock profiles to avoid side effects
jest.mock('@/lib/profiles', () => ({
  getProfileSites: jest.fn(() => []),
}));

describe('site-config', () => {
  const mockHomeDir = '/mock-home';
  // Use path.join to match the implementation's behavior
  const mockConfigDir = path.join(mockHomeDir, '.juggernaut');
  const mockConfigPath = path.join(mockConfigDir, 'site-config.json');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConfig', () => {
    it('should create config directory and default config file if they do not exist', () => {
      // Setup mocks
      (fs.existsSync as jest.Mock).mockReturnValue(false); // Neither dir nor file exists

      // Execute
      const config = getConfig();

      // Verify
      expect(fs.existsSync).toHaveBeenCalledWith(mockConfigDir);
      // existsSync is called twice: once for dir, once for file (if dir creation succeeds)
      // Actually, implementation checks dir, makes it, then checks file.
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockConfigDir, { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockConfigPath,
        JSON.stringify({ activeTarget: 'local' }, null, 2)
      );
      expect(config).toEqual({ activeTarget: 'local' });
    });

    it('should create default config file if directory exists but file does not', () => {
      // Setup mocks
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockConfigDir) return true;
        if (p === mockConfigPath) return false;
        return false;
      });

      // Execute
      const config = getConfig();

      // Verify
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockConfigPath,
        JSON.stringify({ activeTarget: 'local' }, null, 2)
      );
      expect(config).toEqual({ activeTarget: 'local' });
    });

    it('should return existing config if file exists', () => {
      const existingConfig = { activeTarget: 'production', credentials: { username: 'user', appPassword: 'pwd' } };

      // Setup mocks
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(existingConfig));

      // Execute
      const config = getConfig();

      // Verify
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
      expect(config).toEqual(existingConfig);
    });

    it('should return default config if reading file fails', () => {
      // Setup mocks
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Read error');
      });

      // Execute
      const config = getConfig();

      // Verify
      expect(config).toEqual({ activeTarget: 'local' });
    });

    it('should return default config if parsing file fails', () => {
       // Setup mocks
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

      // Execute
      const config = getConfig();

      // Verify
      expect(config).toEqual({ activeTarget: 'local' });
    });
  });
});
