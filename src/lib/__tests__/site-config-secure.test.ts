import fs from 'fs';
import { getStoredCredentials, setCredentials } from '../site-config';

// Mock fs to avoid writing to disk
jest.mock('fs');
jest.mock('path', () => ({
  join: (...args: string[]) => args.join('/'),
  dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
  resolve: (...args: string[]) => args.join('/'),
}));
jest.mock('os', () => ({
  homedir: () => '/home/user',
}));

// Mock profiles to avoid loading issues
jest.mock('@/lib/profiles', () => ({
  getProfileSites: jest.fn().mockReturnValue([]),
}));

describe('site-config secure storage', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.JUGGERNAUT_ELECTRON;
    delete process.env.JUGGERNAUT_CREDENTIALS;

    // Mock fs implementation default
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
      activeTarget: 'local',
      siteCredentials: {
        'local': { username: 'local_user', appPassword: 'local_password' }
      }
    }));
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should read from site-config.json in dev mode', () => {
    delete process.env.JUGGERNAUT_ELECTRON;

    const creds = getStoredCredentials('local');
    expect(creds).toEqual({ username: 'local_user', appPassword: 'local_password' });
  });

  it('should read from JUGGERNAUT_CREDENTIALS in Electron mode', () => {
    process.env.JUGGERNAUT_ELECTRON = '1';
    process.env.JUGGERNAUT_CREDENTIALS = JSON.stringify({
      'remote-site': { username: 'remote_user', appPassword: 'remote_password' }
    });

    // Should ignore local file content (which has local_user) and return null if not in env
    const localCreds = getStoredCredentials('local');
    expect(localCreds).toBeNull();

    // Should find remote creds
    const remoteCreds = getStoredCredentials('remote-site');
    expect(remoteCreds).toEqual({ username: 'remote_user', appPassword: 'remote_password' });
  });

  it('should NOT write credentials to disk in Electron mode', () => {
    process.env.JUGGERNAUT_ELECTRON = '1';

    setCredentials('new_user', 'new_pass');

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should write credentials to disk in dev mode', () => {
    delete process.env.JUGGERNAUT_ELECTRON;

    setCredentials('new_user', 'new_pass');

    expect(fs.writeFileSync).toHaveBeenCalled();
    const writeArg = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
    const config = JSON.parse(writeArg);
    expect(config.siteCredentials.local).toEqual({ username: 'new_user', appPassword: 'new_pass' });
  });
});
