/**
 * MCP Server Plugin for Juggernaut
 *
 * Feature-flag plugin that controls whether the MCP (Model Context Protocol)
 * server is allowed to operate. The MCP server is a separate process spawned
 * by external MCP clients (e.g., Claude Code). On startup, it reads the
 * plugin registry and refuses to operate if this plugin is disabled.
 *
 * This plugin does not register hooks or transform data — it only controls
 * the enabled/disabled state in the plugin registry.
 */

import type {
  JuggernautPlugin,
  PluginManifest,
  CoreAPI,
  SiteProfile,
} from '../../types';
import manifest from './manifest.json';

class McpServerPlugin implements JuggernautPlugin {
  // ─── Metadata (from manifest.json) ───────────────────────────────────────
  id = manifest.id;
  name = manifest.name;
  version = manifest.version;
  manifest = manifest as PluginManifest;

  // ─── Private State ───────────────────────────────────────────────────────
  private coreAPI: CoreAPI | null = null;

  // ─── Lifecycle: initialize() ─────────────────────────────────────────────
  async initialize(core: CoreAPI): Promise<void> {
    this.coreAPI = core;
    core.log(`[McpServer] Plugin initializing v${this.version}`, 'info');
    core.log('[McpServer] Plugin initialized', 'info');
  }

  // ─── Lifecycle: activate() ───────────────────────────────────────────────
  async activate(profile: SiteProfile, _settings: Record<string, unknown>): Promise<void> {
    this.coreAPI?.log(`[McpServer] Activated for profile: ${profile.profile_id}`, 'info');
  }

  // ─── Lifecycle: deactivate() ─────────────────────────────────────────────
  async deactivate(): Promise<void> {
    this.coreAPI?.log('[McpServer] Plugin deactivated', 'info');
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────
export const mcpServerPlugin = new McpServerPlugin();
export default mcpServerPlugin;
