/**
 * User configuration directory helpers.
 *
 * Everything that is specific to one user's install (site credentials,
 * profiles, prompt templates, agent-guide rules) lives outside the app/repo
 * directory so it survives app updates and never ends up in a public build.
 *
 * Default location: `~/.juggernaut/`. Override with `JUGGERNAUT_CONFIG_DIR`
 * (used by tests). Resolved on every call so tests can swap it per case.
 */

import os from 'os';
import path from 'path';

/** Root user config dir (`~/.juggernaut` unless overridden). */
export function getUserConfigDir(): string {
  return process.env.JUGGERNAUT_CONFIG_DIR || path.join(os.homedir(), '.juggernaut');
}

/** User profiles dir: every `*.json` in here is auto-discovered as a profile. */
export function getUserProfilesDir(): string {
  return path.join(getUserConfigDir(), 'profiles');
}

/** User prompt templates dir: `<id>/template.md` plus timestamped versions. */
export function getUserPromptTemplatesDir(): string {
  return path.join(getUserConfigDir(), 'prompt-templates');
}

/** Small JSON file that remembers which profile the user last activated. */
export function getActiveProfileStatePath(): string {
  return path.join(getUserConfigDir(), 'active-profile.json');
}
