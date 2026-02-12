/**
 * AI Fill Plugin
 *
 * Provides AI-powered content generation via prompt templates.
 * Users copy prompts to ChatGPT/Claude, paste responses back, and
 * the plugin parses the response to auto-fill resource fields.
 *
 * UI: Registers the "AI Fill" tab via registerPluginTab('ai', AIFillTab).
 * The tab component is in AIFillTab.tsx and self-registers as a side effect.
 */

import type {
  JuggernautPlugin,
  PluginManifest,
  CoreAPI,
  SiteProfile,
} from '../../types';
import manifest from './manifest.json';

class AIFillPlugin implements JuggernautPlugin {
  id = manifest.id;
  name = manifest.name;
  version = manifest.version;
  manifest = manifest as PluginManifest;

  private coreAPI: CoreAPI | null = null;

  async initialize(core: CoreAPI): Promise<void> {
    this.coreAPI = core;
    core.log(`[${this.name}] Plugin initialized`, 'info');
  }

  async activate(_profile: SiteProfile, _settings: Record<string, unknown>): Promise<void> {
    this.coreAPI?.log(`[${this.name}] Plugin activated`, 'info');
  }

  async deactivate(): Promise<void> {
    this.coreAPI?.log(`[${this.name}] Plugin deactivated`, 'info');
  }
}

export const aiFillPlugin = new AIFillPlugin();
export default aiFillPlugin;
