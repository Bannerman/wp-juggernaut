import { PluginLoader } from '../loader';
import { CoreAPI, JuggernautPlugin, HookSystem } from '../types';

// Mock the bundled plugins module
jest.mock('../bundled', () => {
  const plugins: any[] = [];
  return {
    bundledPlugins: plugins,
  };
});

// Mock dependencies
jest.mock('../registry', () => ({
  getPluginRegistry: jest.fn(() => ({
    registerPlugin: jest.fn(),
    enablePlugin: jest.fn(),
    disablePlugin: jest.fn(),
  })),
}));

jest.mock('../hooks', () => ({
  getHookSystem: jest.fn(() => ({
    trigger: jest.fn(),
  })),
  HOOKS: {
    PLUGIN_ENABLED: 'plugin:enabled',
    PLUGIN_DISABLED: 'plugin:disabled',
  },
}));

describe('PluginLoader', () => {
  let coreAPI: CoreAPI;
  let mockPlugin: JuggernautPlugin;

  beforeEach(() => {
    // Reset the singleton
    // @ts-ignore - Accessing private/protected method for testing
    if (PluginLoader.instance) {
      PluginLoader.reset();
    }

    jest.clearAllMocks();

    // Mock CoreAPI
    coreAPI = {
      version: '1.0.0',
      hooks: {
        on: jest.fn(),
        trigger: jest.fn(),
        clear: jest.fn(),
      } as unknown as HookSystem,
      getProfile: jest.fn(),
      getBaseUrl: jest.fn(),
      getAuthHeader: jest.fn(),
      database: {
        query: jest.fn(),
        run: jest.fn(),
      },
      showNotification: jest.fn(),
      log: jest.fn(),
    } as unknown as CoreAPI;

    // Mock Plugin
    mockPlugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      manifest: {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        tier: 'community',
      },
      initialize: jest.fn().mockResolvedValue(undefined),
      activate: jest.fn().mockResolvedValue(undefined),
      deactivate: jest.fn().mockResolvedValue(undefined),
    } as unknown as JuggernautPlugin;

    // Reset the mock plugins array
    const bundledModule = require('../bundled');
    bundledModule.bundledPlugins.length = 0;
    bundledModule.bundledPlugins.push(mockPlugin);
  });

  describe('initialize', () => {
    it('should register bundled plugins on initialization', async () => {
      const loader = PluginLoader.getInstance();
      await loader.initialize(coreAPI);

      const plugins = loader.getAllPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].id).toBe('test-plugin');
    });

    it('should not re-initialize if already initialized', async () => {
      const loader = PluginLoader.getInstance();

      // Spy on console.warn
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await loader.initialize(coreAPI);
      await loader.initialize(coreAPI);

      expect(consoleSpy).toHaveBeenCalledWith('[PluginLoader] Already initialized');

      consoleSpy.mockRestore();
    });

    it('should handle empty bundled plugins', async () => {
      // Setup empty bundled plugins
      const bundledModule = require('../bundled');
      bundledModule.bundledPlugins.length = 0;

      const loader = PluginLoader.getInstance();
      await loader.initialize(coreAPI);

      const plugins = loader.getAllPlugins();
      expect(plugins).toHaveLength(0);
    });
  });
});
