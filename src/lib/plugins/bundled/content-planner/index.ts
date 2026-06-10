/**
 * Content Planner Plugin for Juggernaut
 *
 * Provides a global "Planner" page in the main nav: idea backlog kanban +
 * keyword/topic planner. Data lives in `planner_ideas` and `planner_keywords`
 * (schema v4); see ./queries.ts for the CRUD layer.
 *
 * Phase A ships only the global-page wiring + stub UI. Phase B fills the UI
 * out; Phase C wires "promote to draft" to the existing create-post pipeline.
 */

import type {
  JuggernautPlugin,
  PluginManifest,
  CoreAPI,
  SiteProfile,
  PageDefinition,
} from '../../types';
import manifest from './manifest.json';
import { PlannerPage } from './PlannerPage';

class ContentPlannerPlugin implements JuggernautPlugin {
  id = manifest.id;
  name = manifest.name;
  version = manifest.version;
  manifest = manifest as PluginManifest;

  private coreAPI: CoreAPI | null = null;
  private settings: Record<string, unknown> = {};

  async initialize(core: CoreAPI): Promise<void> {
    this.coreAPI = core;
    core.log(`[ContentPlanner] Plugin initializing v${this.version}`, 'info');
  }

  async activate(profile: SiteProfile, settings: Record<string, unknown>): Promise<void> {
    this.settings = settings;
    this.coreAPI?.log(
      `[ContentPlanner] Activated for profile: ${profile.profile_id}`,
      'info',
    );
  }

  async deactivate(): Promise<void> {
    this.coreAPI?.log('[ContentPlanner] Deactivated', 'info');
  }

  getGlobalPages(): PageDefinition[] {
    return [
      {
        id: 'planner',
        label: 'Planner',
        icon: 'ClipboardList',
        position: 50,
        pluginId: this.id,
        component: PlannerPage,
      },
    ];
  }
}

const contentPlannerPlugin = new ContentPlannerPlugin();
export default contentPlannerPlugin;
