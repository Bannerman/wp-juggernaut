import fs from 'fs';
import path from 'path';

// Store in project root so it syncs to git
const CONFIG_PATH = path.join(process.cwd(), 'site-config.json');

export interface SiteTarget {
  id: string;
  name: string;
  url: string;
  description: string;
}

export const SITE_TARGETS: SiteTarget[] = [
  {
    id: 'local',
    name: 'Local Development',
    url: 'http://plexkits-v4.local',
    description: 'Local WordPress development environment',
  },
  {
    id: 'staging',
    name: 'Staging',
    url: 'https://staging.plexkits.com',
    description: 'Staging environment for testing',
  },
  {
    id: 'production',
    name: 'Production',
    url: 'https://plexkits.com',
    description: 'Live production site',
  },
];

interface SiteConfig {
  activeTarget: string;
  credentials?: {
    username: string;
    appPassword: string;
  };
}

export function getConfig(): SiteConfig {
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
  const target = SITE_TARGETS.find(t => t.id === targetId);
  if (!target) {
    throw new Error(`Unknown target: ${targetId}`);
  }

  const config: SiteConfig = { activeTarget: targetId };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
}

export function getActiveTarget(): SiteTarget {
  const config = getConfig();
  const target = SITE_TARGETS.find(t => t.id === config.activeTarget);
  return target || SITE_TARGETS[0];
}

export function getActiveBaseUrl(): string {
  // Use the active target from config file (allows UI switching)
  return getActiveTarget().url;
}

export function getCredentials(): { username: string; appPassword: string } | null {
  const config = getConfig();
  if (config.credentials?.username && config.credentials?.appPassword) {
    return config.credentials;
  }
  return null;
}

export function setCredentials(username: string, appPassword: string): SiteConfig {
  const config = getConfig();
  const newConfig: SiteConfig = {
    ...config,
    credentials: { username, appPassword },
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
  return newConfig;
}
