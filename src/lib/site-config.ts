import fs from 'fs';
import os from 'os';
import path from 'path';
import { getProfileSites } from '@/lib/profiles';

// Store outside the repo to avoid accidental commits of credentials
const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.juggernaut');
const CONFIG_DIR = process.env.JUGGERNAUT_CONFIG_DIR || DEFAULT_CONFIG_DIR;
const CONFIG_PATH = path.join(CONFIG_DIR, 'site-config.json');

export interface SiteTarget {
  id: string;
  name: string;
  url: string;
  description: string;
}

/**
 * Get site targets from the active profile.
 * Maps profile SiteConfig entries to SiteTarget format.
 */
export function getSiteTargets(): SiteTarget[] {
  return getProfileSites().map((site) => ({
    id: site.id,
    name: site.name,
    url: site.url,
    description: site.description || '',
  }));
}

interface SiteCredentials {
  username: string;
  appPassword: string;
}

interface SiteConfig {
  activeTarget: string;
  // Per-site credentials keyed by target id
  siteCredentials?: Record<string, SiteCredentials>;
  // Legacy: single credentials for all sites (migrated to siteCredentials on first write)
  credentials?: SiteCredentials;
}

export function getConfig(): SiteConfig {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    // Default to local
    const defaultConfig: SiteConfig = { activeTarget: 'local' };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }

  try {
    // Always read fresh from disk (no caching)
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { activeTarget: 'local' };
  }
}

export function setActiveTarget(targetId: string): SiteConfig {
  const targets = getSiteTargets();
  const target = targets.find(t => t.id === targetId);
  if (!target) {
    throw new Error(`Unknown target: ${targetId}`);
  }

  const config = getConfig();
  const newConfig: SiteConfig = { ...config, activeTarget: targetId };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
  return newConfig;
}

export function getActiveTarget(): SiteTarget {
  const targets = getSiteTargets();
  const config = getConfig();
  const target = targets.find(t => t.id === config.activeTarget);
  return target || targets[0];
}

export function getActiveBaseUrl(): string {
  // Use the active target from config file (allows UI switching)
  return getActiveTarget().url;
}

export function getCredentials(): { username: string; appPassword: string } | null {
  const config = getConfig();
  const targetId = config.activeTarget;

  // Check per-site credentials first
  const siteCreds = config.siteCredentials?.[targetId];
  if (siteCreds?.username && siteCreds?.appPassword) {
    return siteCreds;
  }

  // Fallback to legacy global credentials
  if (config.credentials?.username && config.credentials?.appPassword) {
    return config.credentials;
  }

  return null;
}

export function setCredentials(username: string, appPassword: string): SiteConfig {
  const config = getConfig();
  const targetId = config.activeTarget;
  const newConfig: SiteConfig = {
    ...config,
    siteCredentials: {
      ...config.siteCredentials,
      [targetId]: { username, appPassword },
    },
  };
  // Remove legacy credentials field if present
  delete newConfig.credentials;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
  return newConfig;
}
