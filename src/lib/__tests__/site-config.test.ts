import fs from 'fs';
import { setActiveTarget, SiteTarget } from '../site-config';
import * as profilesModule from '../profiles';

jest.mock('fs');
jest.mock('../profiles');

describe('site-config', () => {
  const mockWriteFileSync = fs.writeFileSync as jest.Mock;
  const mockReadFileSync = fs.readFileSync as jest.Mock;
  const mockExistsSync = fs.existsSync as jest.Mock;
  const mockGetProfileSites = profilesModule.getProfileSites as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ activeTarget: 'local' }));
    mockGetProfileSites.mockReturnValue([
      { id: 'local', name: 'Local', url: 'http://localhost', description: 'Local Dev', environment: 'development' },
      { id: 'prod', name: 'Production', url: 'https://example.com', description: 'Prod Site', environment: 'production' }
    ] as SiteTarget[]);
  });

  describe('setActiveTarget', () => {
    it('should set the active target when given a valid target ID', () => {
      const newConfig = setActiveTarget('prod');

      expect(newConfig.activeTarget).toBe('prod');
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('site-config.json'),
        expect.stringContaining('"activeTarget": "prod"')
      );
    });

    it('should throw an error when given an invalid target ID', () => {
      expect(() => {
        setActiveTarget('invalid-id');
      }).toThrow('Unknown target: invalid-id');

      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });
});
