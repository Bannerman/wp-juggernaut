import { PluginLoader } from '../loader';
import { getPluginRegistry } from '../registry';
import type { JuggernautPlugin } from '../types';

// Mock the registry module
jest.mock('../registry', () => ({
  getPluginRegistry: jest.fn(),
}));

describe('PluginLoader', () => {
  let loader: PluginLoader;
  let mockRegistry: { registerPlugin: jest.Mock };

  beforeEach(() => {
    // Reset the singleton instance
    PluginLoader.reset();
    loader = PluginLoader.getInstance();

    // Setup mock registry
    mockRegistry = {
      registerPlugin: jest.fn(),
    };
    (getPluginRegistry as jest.Mock).mockReturnValue(mockRegistry);

    // Mock console methods to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createMockPlugin = (id: string): JuggernautPlugin => ({
    id,
    name: `Test Plugin ${id}`,
    version: '1.0.0',
    manifest: {
      id,
      name: `Test Plugin ${id}`,
      version: '1.0.0',
      description: 'Test Description',
      tier: 'community',
    },
    initialize: jest.fn(),
    activate: jest.fn(),
    deactivate: jest.fn(),
  });

  describe('registerPlugin', () => {
    it('should register a new plugin successfully', () => {
      const plugin = createMockPlugin('test-plugin');

      loader.registerPlugin(plugin);

      // Verify plugin is stored in state
      expect(loader.getPlugin('test-plugin')).toBe(plugin);

      // Verify it was registered with the registry
      expect(mockRegistry.registerPlugin).toHaveBeenCalledWith(
        'test-plugin',
        'community',
        '1.0.0'
      );

      // Verify log message
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Registered plugin: test-plugin')
      );
    });

    it('should not register a duplicate plugin', () => {
      const plugin = createMockPlugin('test-plugin');

      // Register first time
      loader.registerPlugin(plugin);

      // Reset mock to clear previous call
      mockRegistry.registerPlugin.mockClear();

      // Register second time
      loader.registerPlugin(plugin);

      // Verify warning was logged
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Plugin already registered: test-plugin')
      );

      // Verify registry was NOT called again
      expect(mockRegistry.registerPlugin).not.toHaveBeenCalled();
    });
  });
});
