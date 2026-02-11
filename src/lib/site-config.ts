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

/**
 * Get credentials for a specific target.
 * In Electron, this reads from the injected secure environment variable.
 * In development (browser), this falls back to site-config.json.
 */
export function getStoredCredentials(targetId: string): SiteCredentials | null {
  // 1. Electron Secure Storage Injection (Production)
  if (process.env.JUGGERNAUT_ELECTRON === '1') {
    try {
      if (process.env.JUGGERNAUT_CREDENTIALS) {
        const credsMap = JSON.parse(process.env.JUGGERNAUT_CREDENTIALS);
        if (credsMap[targetId]) {
          return credsMap[targetId];
        }
      }
      return null;
    } catch (e) {
      console.error('Failed to parse JUGGERNAUT_CREDENTIALS:', e);
      return null;
    }
  }

  // 2. Local/Dev Config File Fallback
  const config = getConfig();

  // Check per-site credentials
  if (config.siteCredentials?.[targetId]) {
    return config.siteCredentials[targetId];
  }

  // Fallback to legacy global credentials if this is the active target
  // (Legacy credentials were implicitly for the active target)
  if (targetId === config.activeTarget && config.credentials) {
    return config.credentials;
  }

  return null;
}

/**
 * Get credentials for the currently active target.
 */
export function getCredentials(): SiteCredentials | null {
  const config = getConfig();
  return getStoredCredentials(config.activeTarget);
}

/**
 * Set credentials for the active target.
 * Note: In Electron, this should be handled via IPC to the main process.
 * This function handles the local dev fallback.
 */
export function setCredentials(username: string, appPassword: string): SiteConfig {
  const config = getConfig();
  const targetId = config.activeTarget;

  if (process.env.JUGGERNAUT_ELECTRON === '1') {
    // In Electron, we should rely on IPC to update credentials securely.
    // The API route should have blocked this, but as a safeguard, we return without writing.
    console.warn('Attempted to write credentials to disk in Electron mode. Operation skipped.');
    return config;
  }

  const newConfig: SiteConfig = {
    ...config,
    siteCredentials: {
      ...config.siteCredentials,
      [targetId]: { username, appPassword },
    },
  };

  // Remove legacy credentials field if present to migrate
  delete newConfig.credentials;

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
  return newConfig;
}

/**
 * Get credential status for all targets (used by API).
 */
export function getAllCredentialsStatus(): Record<string, { hasCredentials: boolean; username: string }> {
  const targets = getSiteTargets();
  const status: Record<string, { hasCredentials: boolean; username: string }> = {};

  for (const target of targets) {
    const creds = getStoredCredentials(target.id);
    status[target.id] = {
      hasCredentials: Boolean(creds?.username && creds?.appPassword),
      username: creds?.username || '',
    };
  }
  return status;
}
