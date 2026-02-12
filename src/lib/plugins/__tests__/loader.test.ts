import { PluginLoader } from '../loader';
import { getPluginRegistry } from '../registry';
import { getHookSystem, HOOKS } from '../hooks';
import type { JuggernautPlugin, CoreAPI } from '../types';

// Mock the dependencies
jest.mock('../registry', () => ({
  getPluginRegistry: jest.fn(),
}));

jest.mock('../hooks', () => ({
  getHookSystem: jest.fn(),
  HOOKS: {
    PLUGIN_ENABLED: 'plugin:enabled',
    PLUGIN_DISABLED: 'plugin:disabled',
  },
}));

// Mock console methods to keep test output clean
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});

describe('PluginLoader', () => {
  let loader: PluginLoader;
  let mockRegistry: any;
  let mockHooks: any;
  let mockCoreAPI: CoreAPI;
  let mockPlugin: JuggernautPlugin;

  beforeEach(() => {
    // Reset the singleton
    PluginLoader.reset();
    loader = PluginLoader.getInstance();

    // Setup mock registry
    mockRegistry = {
      enablePlugin: jest.fn(),
      disablePlugin: jest.fn(),
      registerPlugin: jest.fn(),
    };
    (getPluginRegistry as jest.Mock).mockReturnValue(mockRegistry);

    // Setup mock hooks
    mockHooks = {
      trigger: jest.fn(),
    };
    (getHookSystem as jest.Mock).mockReturnValue(mockHooks);

    // Setup mock CoreAPI
    mockCoreAPI = {
      version: '1.0.0',
    } as any;

    // Setup mock plugin
    mockPlugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      manifest: {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'Test plugin',
        tier: 'community',
      },
      initialize: jest.fn().mockResolvedValue(undefined),
      activate: jest.fn().mockResolvedValue(undefined),
      deactivate: jest.fn().mockResolvedValue(undefined),
    } as any;
  });

  describe('activatePlugin', () => {
    it('should return false if plugin does not exist', async () => {
      const result = await loader.activatePlugin('unknown-plugin');
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Cannot activate unknown plugin'));
    });

    it('should return false if loader is not initialized (no CoreAPI)', async () => {
      // Register plugin but don't initialize loader
      loader.registerPlugin(mockPlugin);

      const result = await loader.activatePlugin('test-plugin');
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('loader not initialized'));
    });

    it('should return true immediately if plugin is already active', async () => {
      // Initialize loader
      await loader.initialize(mockCoreAPI);

      // Register and activate plugin once
      loader.registerPlugin(mockPlugin);
      await loader.activatePlugin('test-plugin');

      // Reset mocks to verify they are NOT called again
      mockPlugin.initialize = jest.fn();
      mockRegistry.enablePlugin.mockClear();
      mockHooks.trigger.mockClear();

      // Activate again
      const result = await loader.activatePlugin('test-plugin');

      expect(result).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Plugin already active'));
      expect(mockPlugin.initialize).not.toHaveBeenCalled();
      expect(mockRegistry.enablePlugin).not.toHaveBeenCalled();
      expect(mockHooks.trigger).not.toHaveBeenCalled();
    });

    it('should successfully activate a plugin', async () => {
      // Initialize loader and register plugin
      await loader.initialize(mockCoreAPI);
      loader.registerPlugin(mockPlugin);

      const result = await loader.activatePlugin('test-plugin');

      expect(result).toBe(true);
      // Verify initialization
      expect(mockPlugin.initialize).toHaveBeenCalledWith(mockCoreAPI);
      // Verify registry update
      expect(mockRegistry.enablePlugin).toHaveBeenCalledWith('test-plugin');
      // Verify hook trigger
      expect(mockHooks.trigger).toHaveBeenCalledWith(HOOKS.PLUGIN_ENABLED, {
        pluginId: 'test-plugin',
        plugin: mockPlugin,
      });
    });

    it('should return false and log error if plugin initialization fails', async () => {
      // Initialize loader and register plugin
      await loader.initialize(mockCoreAPI);
      loader.registerPlugin(mockPlugin);

      // Make plugin initialization fail
      const error = new Error('Init failed');
      (mockPlugin.initialize as jest.Mock).mockRejectedValue(error);

      const result = await loader.activatePlugin('test-plugin');

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to activate plugin'),
        error
      );
      // Verify registry was NOT updated
      expect(mockRegistry.enablePlugin).not.toHaveBeenCalled();
      // Verify hook was NOT triggered
      expect(mockHooks.trigger).not.toHaveBeenCalled();
    });
  });
});
