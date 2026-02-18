import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { getProfileSites } from '@/lib/profiles';

// Store outside the repo to avoid accidental commits of credentials
const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.juggernaut');
const CONFIG_DIR = process.env.JUGGERNAUT_CONFIG_DIR || DEFAULT_CONFIG_DIR;
const CONFIG_PATH = path.join(CONFIG_DIR, 'site-config.json');
const CREDENTIALS_ENC_PATH = path.join(CONFIG_DIR, 'credentials.enc');

// Encryption constants for non-Electron environments
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

export type EnvironmentType = 'production' | 'staging' | 'development';

export interface SiteTarget {
  id: string;
  name: string;
  url: string;
  description: string;
  environment: EnvironmentType;
}

function deriveEnvironment(siteId: string): EnvironmentType {
  const id = siteId.toLowerCase();
  if (id.includes('prod')) return 'production';
  if (id.includes('stag')) return 'staging';
  return 'development';
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
    environment: site.environment || deriveEnvironment(site.id),
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

/**
 * Helper to save config to disk while ensuring sensitive data is NOT included.
 */
function saveConfig(config: SiteConfig): SiteConfig {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const configToSave = { ...config };
  // NEVER save credentials in the main config file
  delete configToSave.credentials;
  delete configToSave.siteCredentials;

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configToSave, null, 2));
  return configToSave;
}

export function getConfig(): SiteConfig {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    // Default to local
    const defaultConfig: SiteConfig = { activeTarget: 'local' };
    return saveConfig(defaultConfig);
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
  config.activeTarget = targetId;
  return saveConfig(config);
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

// ─── Secure Storage (Non-Electron) ──────────────────────────────────────────

function getMachineKey(): Buffer {
  // Derive a stable machine-specific key
  const machineId = os.hostname() + (process.env.USER || process.env.USERNAME || 'juggernaut');
  return crypto.createHash('sha256').update(machineId).digest();
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMachineKey(), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  try {
    const textParts = text.split(':');
    if (textParts.length < 2) return '';
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getMachineKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('[site-config] Decryption failed:', error);
    return '';
  }
}

function getEncryptedStore(): Record<string, SiteCredentials> {
  if (!fs.existsSync(CREDENTIALS_ENC_PATH)) return {};
  try {
    const encryptedContent = fs.readFileSync(CREDENTIALS_ENC_PATH, 'utf-8');
    const decrypted = decrypt(encryptedContent);
    return decrypted ? JSON.parse(decrypted) : {};
  } catch (error) {
    console.error('[site-config] Failed to read encrypted store:', error);
    return {};
  }
}

function setEncryptedStore(store: Record<string, SiteCredentials>): void {
  try {
    const encrypted = encrypt(JSON.stringify(store));
    fs.writeFileSync(CREDENTIALS_ENC_PATH, encrypted, { mode: 0o600 });
  } catch (error) {
    console.error('[site-config] Failed to save encrypted store:', error);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function getCredentials(): SiteCredentials | null {
  const config = getConfig();
  const targetId = config.activeTarget;

  // 1. Check for Electron-injected credentials (highest priority)
  if (process.env.JUGGERNAUT_CREDENTIALS) {
    try {
      const allCreds = JSON.parse(process.env.JUGGERNAUT_CREDENTIALS);
      if (allCreds[targetId]) return allCreds[targetId];
    } catch {
      // Fallback
    }
  }

  // 2. Check encrypted store (non-Electron or dev fallback)
  const store = getEncryptedStore();
  if (store[targetId]) return store[targetId];

  // 3. Fallback to site-config.json (legacy, supports migration)
  const siteCreds = config.siteCredentials?.[targetId];
  if (siteCreds?.username && siteCreds?.appPassword) {
    return siteCreds;
  }

  const legacyCreds = config.credentials;
  if (legacyCreds?.username && legacyCreds?.appPassword) {
    return legacyCreds;
  }

  return null;
}

export function setCredentials(username: string, appPassword: string): SiteConfig {
  const config = getConfig();
  const targetId = config.activeTarget;

  // If we are in Electron, the credential saving is handled by the main process
  // via IPC. site-config.ts just ensures the config on disk is clean.
  if (process.env.JUGGERNAUT_ELECTRON !== '1') {
    // Non-Electron: Use encrypted local storage
    const store = getEncryptedStore();
    store[targetId] = { username, appPassword };
    setEncryptedStore(store);
  }

  // Always save a clean config (removes plaintext credentials if they existed)
  return saveConfig(config);
}
