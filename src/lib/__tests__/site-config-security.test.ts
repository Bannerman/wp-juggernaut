import fs from 'fs';
import os from 'os';
import path from 'path';
import { setCredentials, getCredentials } from '../site-config';

// Mock fs and os to control test environment
jest.mock('fs');
jest.mock('os');

describe('site-config security', () => {
  const mockWriteFileSync = fs.writeFileSync as jest.Mock;
  const mockReadFileSync = fs.readFileSync as jest.Mock;
  const mockExistsSync = fs.existsSync as jest.Mock;

  const mockHomedir = '/mock/home';
  const configDir = path.join(mockHomedir, '.juggernaut');
  const configPath = path.join(configDir, 'site-config.json');
  const credsEncPath = path.join(configDir, 'credentials.enc');

  beforeEach(() => {
    jest.clearAllMocks();
    (os.homedir as jest.Mock).mockReturnValue(mockHomedir);
    (os.hostname as jest.Mock).mockReturnValue('mock-host');
    (os.userInfo as jest.Mock).mockReturnValue({ username: 'mock-user' });
    process.env.JUGGERNAUT_CONFIG_DIR = configDir;
    delete process.env.JUGGERNAUT_ELECTRON;
    delete process.env.JUGGERNAUT_CREDENTIALS;

    mockExistsSync.mockImplementation((p) => {
      if (p === configDir) return true;
      if (p === configPath) return true;
      return false;
    });

    mockReadFileSync.mockImplementation((p) => {
      if (p === configPath) return JSON.stringify({ activeTarget: 'local' });
      return null;
    });
  });

  it('should not store credentials in site-config.json when setCredentials is called', () => {
    setCredentials('admin', 'password123');

    // Verify site-config.json was written without credentials
    const siteConfigCall = mockWriteFileSync.mock.calls.find(call => call[0] === configPath);
    expect(siteConfigCall).toBeDefined();
    const siteConfigContent = JSON.parse(siteConfigCall[1]);
    expect(siteConfigContent.credentials).toBeUndefined();
    expect(siteConfigContent.siteCredentials).toBeUndefined();
  });

  it('should store encrypted credentials in a separate file', () => {
    setCredentials('admin', 'password123');

    // Verify credentials.enc was written
    const credsCall = mockWriteFileSync.mock.calls.find(call => call[0] === credsEncPath);
    expect(credsCall).toBeDefined();
    expect(credsCall[1]).not.toContain('password123'); // Should be encrypted
    expect(credsCall[2]).toEqual({ mode: 0o600 }); // Should have restricted permissions
  });

  it('should be able to retrieve credentials that were stored encrypted', () => {
    let storedEncryptedData = '';
    mockWriteFileSync.mockImplementation((p, data) => {
      if (p === credsEncPath) storedEncryptedData = data;
    });

    setCredentials('admin', 'password123');

    mockExistsSync.mockImplementation((p) => {
      if (p === credsEncPath) return true;
      if (p === configPath) return true;
      return true;
    });

    mockReadFileSync.mockImplementation((p) => {
      if (p === credsEncPath) return storedEncryptedData;
      if (p === configPath) return JSON.stringify({ activeTarget: 'local' });
      return null;
    });

    const creds = getCredentials();
    expect(creds).toEqual({ username: 'admin', appPassword: 'password123' });
  });
});
