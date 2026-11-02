/**
 * Profile discovery tests: bundled default profile, user profiles from
 * JUGGERNAUT_CONFIG_DIR/profiles, default selection priority, persisted
 * imports, copy-on-write for edits.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ProfileManager,
  DEFAULT_PROFILE_ID,
  ensureProfileLoaded,
  getActiveProfileFilePath,
  validateProfile,
} from '../profiles';

function makeProfile(id: string, extra: Record<string, unknown> = {}) {
  return {
    profile_id: id,
    profile_name: `Profile ${id}`,
    profile_version: '1.0.0',
    sites: [{ id: 'local', name: 'Local', url: 'http://example.test' }],
    post_types: [{ slug: 'post', name: 'Posts', rest_base: 'posts', is_primary: true }],
    taxonomies: [],
    ...extra,
  };
}

describe('ProfileManager user profiles', () => {
  let dir: string;
  let profilesDir: string;
  const originalConfigDir = process.env.JUGGERNAUT_CONFIG_DIR;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jugg-profiles-'));
    profilesDir = path.join(dir, 'profiles');
    process.env.JUGGERNAUT_CONFIG_DIR = dir;
    ProfileManager.reset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    ProfileManager.reset();
    process.env.JUGGERNAUT_CONFIG_DIR = originalConfigDir;
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  function writeUserProfile(file: string, profile: unknown, mtime?: Date) {
    fs.mkdirSync(profilesDir, { recursive: true });
    const p = path.join(profilesDir, file);
    fs.writeFileSync(p, JSON.stringify(profile));
    if (mtime) fs.utimesSync(p, mtime, mtime);
    return p;
  }

  it('loads only the bundled generic default profile when no user dir exists', () => {
    const manager = ProfileManager.getInstance();
    const ids = manager.getAvailableProfiles().map((p) => p.profile_id);
    expect(ids).toEqual([DEFAULT_PROFILE_ID]);
    const profile = ensureProfileLoaded();
    expect(profile.profile_id).toBe(DEFAULT_PROFILE_ID);
    expect(profile.post_types.map((pt) => pt.slug)).toEqual(['post', 'page']);
    expect(profile.taxonomies.map((t) => t.slug)).toEqual(['category', 'post_tag']);
  });

  it('discovers user profiles and prefers them over the bundled default', () => {
    writeUserProfile('mine.json', makeProfile('mine'));
    const profile = ensureProfileLoaded();
    expect(profile.profile_id).toBe('mine');
    expect(ProfileManager.getInstance().getProfileSource('mine')?.kind).toBe('user');
  });

  it('skips invalid profile files', () => {
    writeUserProfile('broken.json', { profile_id: 'broken' });
    fs.writeFileSync(path.join(profilesDir, 'garbage.json'), '{not json');
    const ids = ProfileManager.getInstance().getAvailableProfiles().map((p) => p.profile_id);
    expect(ids).toEqual([DEFAULT_PROFILE_ID]);
  });

  it('picks is_default over the most recently modified profile', () => {
    writeUserProfile('a.json', makeProfile('a', { is_default: true }), new Date('2020-01-01'));
    writeUserProfile('b.json', makeProfile('b'), new Date('2024-01-01'));
    expect(ensureProfileLoaded().profile_id).toBe('a');
  });

  it('picks the most recently modified profile when none is flagged', () => {
    writeUserProfile('a.json', makeProfile('a'), new Date('2020-01-01'));
    writeUserProfile('b.json', makeProfile('b'), new Date('2024-01-01'));
    expect(ensureProfileLoaded().profile_id).toBe('b');
  });

  it('remembers the explicitly activated profile across restarts', () => {
    writeUserProfile('a.json', makeProfile('a'), new Date('2020-01-01'));
    writeUserProfile('b.json', makeProfile('b'), new Date('2024-01-01'));
    ProfileManager.getInstance().setCurrentProfile('a', { persist: true });
    ProfileManager.reset();
    expect(ensureProfileLoaded().profile_id).toBe('a');
  });

  it('persists imported profiles to the user profiles dir', () => {
    const { filePath } = ProfileManager.getInstance().importProfile(makeProfile('Imported One'));
    expect(filePath).toBe(path.join(profilesDir, 'imported-one.json'));
    ProfileManager.reset();
    expect(ProfileManager.getInstance().getProfile('Imported One')).toBeDefined();
  });

  it('deletes user profiles and falls back to the bundled default', () => {
    const p = writeUserProfile('mine.json', makeProfile('mine'));
    const manager = ProfileManager.getInstance();
    ensureProfileLoaded();
    expect(manager.deleteUserProfile('mine')).toBe(true);
    expect(fs.existsSync(p)).toBe(false);
    expect(manager.getCurrentProfile()?.profile_id).toBe(DEFAULT_PROFILE_ID);
    expect(manager.deleteUserProfile(DEFAULT_PROFILE_ID)).toBe(false);
  });

  it('copies the bundled profile to the user dir before it is edited', () => {
    ensureProfileLoaded();
    const filePath = getActiveProfileFilePath();
    expect(filePath).toBe(path.join(profilesDir, 'default.json'));
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8')).profile_id).toBe(DEFAULT_PROFILE_ID);
  });

  it('returns the backing file for user profiles', () => {
    const p = writeUserProfile('custom-name.json', makeProfile('mine'));
    ensureProfileLoaded();
    expect(getActiveProfileFilePath()).toBe(p);
  });

  it('validateProfile rejects profiles without sites', () => {
    expect(() => validateProfile({ profile_id: 'x', profile_name: 'X', sites: [] })).toThrow(/sites/);
  });
});
